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

module.exports.incoming = (event, context, callback) => {
  const requestContextStage =
    event.requestContext
    ? event.requestContext.stage
    : 'test';
  const stripeApiKey = ConfigFile.stripe.dev_sk
  const stripe = require('stripe')(stripeApiKey); // eslint-disable-line

  try {
    // Parse Stripe Event
    const jsonData = JSON.parse(event.body); // https://stripe.com/docs/api#event_object

    // Verify the event by fetching it from Stripe
    console.log("Stripe Event: %j", jsonData); // eslint-disable-line
    
    testFunction(jsonData);

    function testFunction (stripeEvent){
      const eventType = stripeEvent.type ? stripeEvent.type : '';
      const response = {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Stripe webhook incoming!',
          stage: requestContextStage,
        }),
      };
      console.log("Event Type: %j", eventType); // eslint-disable-line

      // Branch by event type
      switch (eventType) {
        case 'payment_intent.succeeded':
          console.log('***Correct case', stripeEvent.type);
          break;
        default:
			console.log('***Wrong case', stripeEvent.type);
          break;
      }
      callback(null, response);
    };
//BL-Start*******************************************************
	
//BL-End*********************************************************
  } catch (err) {
    callback(null, {
      statusCode: err.statusCode || 501,
      headers: { 'Content-Type': 'text/plain' },
      body: err.message || 'Internal server error',
    });
  }
};
