'use strict';

const ConfigFile = require('config'); // eslint-disable-line
//BL-Start*******************************************************
const AWS = require('aws-sdk');
AWS.config.update({
	region: 'ap-southeast-1'
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamodbTableName1 = 'TB_COMPANIES';
const dynamodbTableName2 = 'TB_PAYMENTS';
//BL-End*********************************************************

module.exports.incoming = async (event, context, callback) => {
	const requestContextStage =
		event.requestContext
			? event.requestContext.stage
			: 'test';
	const stripeApiKey = ConfigFile.stripe.dev_sk
	const stripe = require('stripe')(stripeApiKey); // eslint-disable-line

	try {
		const stripeEvent = JSON.parse(event.body);
		console.log("Stripe Event: %j", stripeEvent); // eslint-disable-line
		
		// Verify the event by fetching it from Stripe
		//const pi = stripeEvent.data.object.payment_intent;
		//const piObject = await stripe.paymentIntents.retrieve(pi);
		

		return await writeFunction(stripeEvent);
		
		async function writeFunction(stripeEvent) {
			const amountTotal = stripeEvent.data.object.amount_total/100;
			console.log("amountTotal: %j", amountTotal)
			let customerEmail = stripeEvent.data.object.customer_email;
			console.log("customerEmail: %j", customerEmail)
			let clientReferenceId = stripeEvent.data.object.client_reference_id;

			const eventType = stripeEvent.type ? stripeEvent.type : '';
			
			console.log("Event Type: %j", eventType); // eslint-disable-line

			// Branch by event type
			switch (eventType) {
				case 'checkout.session.completed':
					console.log('***Correct case', stripeEvent.type);
					let currrentCredit = await getCompaniesTable(customerEmail);
					console.log(currrentCredit);
					let newCredit = (Number(currrentCredit) + amountTotal);
					await updateCompaniesTable(customerEmail, newCredit);
					console.log('done update company');
					//let count = await getPaymentsCount() + 1;
					await writePaymentsTable(clientReferenceId, amountTotal, amountTotal, customerEmail, clientReferenceId);
					break;
				default:
					console.log('***Wrong case', stripeEvent.type);
					break;
			}
			const response = {
				statusCode: 200,
				body: JSON.stringify({
					message: 'Stripe webhook incoming!',
					stage: requestContextStage,
				}),
			};
			return response;
		};
		//BL-Start*******************************************************

		async function updateCompaniesTable(EMAIL, FinalAMT) {
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

		async function writePaymentsTable(PAYMENTS_ID, AMOUNT, CAMPAIGN_FUNDS_PURCHASED, COMPANIES_ID, TRANSACTION_ID) {
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
				return response.Item.CAMPAIGN_FUNDS;

			}, (error) => {
				console.error('Do your custom error handling here. I am just gonna log it: ', error);
			});
		}

		async function getPaymentsCount() {
			const params = {
				TableName: dynamodbTableName2
			}
			const allClassifications = await scanDynamoRecords(params, []);
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
		//BL-End*********************************************************
	} catch (err) {
		console.log(err);
		callback(null, {
			statusCode: err.statusCode || 501,
			headers: { 'Content-Type': 'text/plain' },
			body: err.message || 'Internal server error',
		});
	}
};
