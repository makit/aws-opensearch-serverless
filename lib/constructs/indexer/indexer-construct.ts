import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ops from 'aws-cdk-lib/aws-opensearchserverless';

export interface IndexerConstructProps {
  productTable: dynamodb.ITable,
  searchDomain: string,
}

export default class IndexerConstruct extends Construct {

  constructor(scope: Construct, id: string, props: IndexerConstructProps) {
    super(scope, id);

    const indexLambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      architecture: lambda.Architecture.ARM_64,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        Domain: props.searchDomain,
        Index: 'product-index'
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: cdk.Duration.minutes(1),
    });

    indexLambda.addEventSource(new eventsources.DynamoEventSource(props.productTable, {
      startingPosition: lambda.StartingPosition.LATEST,
    }));

    indexLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['es:ESHttpPost', 'es:ESHttpPut'],
      resources: ['*']
    }));

    // Need access to the data - so add the data policy for the role
    new ops.CfnAccessPolicy(this, 'ProductDataPolicy', {
      name: 'product-data-policy',
      policy: `[{"Description": "Access from lambda role to push", "Rules":[{"ResourceType":"index","Resource":["index/product-collection/*"],"Permission":["aoss:*"]}, {"ResourceType":"collection","Resource":["collection/product-collection"],"Permission":["aoss:*"]}], "Principal":["${indexLambda.role?.roleArn}"]}]`,
      type: 'data'
    });
  }
}