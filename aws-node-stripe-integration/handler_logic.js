const AWS = require('aws-sdk');
AWS.config.update({
    region: 'ap-southeast-1'
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamodbTableName1 = 'TB_COMPANIES';
const dynamodbTableName2 = 'TB_PAYMENTS';
const stripe = require('stripe')(process.env.STRIPE_SECRET);


exports.handler = async function (event, context) {
  const webhookSecret = "whsec_0fa9ae04121e04b29216022f5f7480f4a08210357cceb912135d8b6384b8402d";
  try {
    //const requestId = event?.requestContext?.requestId;
    const sig = event?.headers['Stripe-Signature'];

    const stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
    const eventType = stripeEvent.type ? stripeEvent.type : '';
    // https://stripe.com/docs/api#event_object
    const jsonData = JSON.parse(event.body);
    
    console.log(`Event Type: ${eventType}`);
    console.log(jsonData);

    const clientReferenceId = stripeEvent.data.object.client_reference_id; 
    const amountTotal = stripeEvent.data.object.amount_total;
    let customerEmail = stripeEvent.data.object['customer_details']?.email;
     console.log('Credit purchase ', amountTotal);
    switch (eventType) {
      case 'checkout.session.async_payment_succeeded':
        {
            let currrentCredit = await getCompaniesTable(customerEmail);
            console.log(currrentCredit);
            let newCredit = (Number(currrentCredit)+amountTotal);
            await updateCompaniesTable(customerEmail,newCredit);
            console.log('done update company');
            let count = await getPaymentsCount() + 1;
            await writePaymentsTable(count,amountTotal,amountTotal,customerEmail,clientReferenceId);

        }
        break;
      default:
        console.log('Unhandled event type');
        console.log(stripeEvent.data.object);
        break;
    }

    const data = {
      statusCode: 200,
      body: JSON.stringify({
        received: true,
      }),
    };
    return data;
  } catch (uncaughtError) {
    console.error(uncaughtError);
    throw uncaughtError;
  }
}



function updateCompaniesTable(EMAIL,FinalAMT) {
    const params = {
        TableName: dynamodbTableName1,
            Key: {
        "EMAIL": EMAIL
    },
        UpdateExpression: "SET CAMPAIGN_FUNDS = :CAMPAIGN_FUNDS", //status is a reserved ATTRIBUTE
        ExpressionAttributeValues: {
            ":CAMPAIGN_FUNDS": FinalAMT
        }
    }
    return dynamodb.update(params).promise();
}

async function writePaymentsTable(PAYMENTS_ID,AMOUNT,CAMPAIGN_FUNDS_PURCHASED,COMPANIES_ID,TRANSACTION_ID) {
    const params = {
        TableName: dynamodbTableName2,
        Item: {
            PAYMENTS_ID: PAYMENTS_ID,
            AMOUNT: AMOUNT,
            CAMPAIGN_FUNDS_PURCHASED: CAMPAIGN_FUNDS_PURCHASED,
            COMPANIES_ID: COMPANIES_ID,
            PAYMENT_STATUS: 'Success',
            PAYMENT_TYPE: 'Stripe',
            TRANSACTION_ID: TRANSACTION_ID
        }
    }
    return dynamodb.put(params).promise();
}

async function getCompaniesTable(customerEmail) {
    const params = {
        TableName: dynamodbTableName1,
        Key: {
            'EMAIL': customerEmail
        }
    }
    return await dynamodb.get(params).promise().then((response) => {
        //return JSON.stringify(response.Item.CAMPAIGN_FUNDS) ;
        return response.Item.CAMPAIGN_FUNDS ;
        
    }, (error) => {
        console.error('Do your custom error handling here. I am just gonna log it: ', error);
    });
}

async function getPaymentsCount() {
    const params = {
        TableName: dynamodbTableName2
    }
    const allClassifications = await scanDynamoRecords(params,[]);
    return allClassifications.length;
}

async function scanDynamoRecords(scanParams, itemArray) {
    try {
        const dynamoData = await dynamodb.scan(scanParams).promise();
        itemArray = itemArray.concat(dynamoData.Items);
        if (dynamoData.LastEvaluatedKey) {
            scanParams.ExclusiveStartkey = dynamoData.LastEvaluatedKey;
            return await scanDynamoRecords(scanParams, itemArray);
        }
        return itemArray;
    } catch (error) {
        console.error('Do your custom error handling here. I am just gonna log it: ', error);
    }
}

function buildResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Headers': 'Access-Control-Allow-Origin,Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,Accept,Origi'	,
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(body)
    };
    
}


