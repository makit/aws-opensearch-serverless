import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ops from 'aws-cdk-lib/aws-opensearchserverless';

export interface ProductConstructProps {
  searchDomain: string,
}

export default class ProductConstruct extends Construct {

  public readonly productTable: dynamodb.ITable;

  constructor(scope: Construct, id: string, props: ProductConstructProps) {
    super(scope, id);

    this.productTable = new dynamodb.Table(this, 'Products', {
      partitionKey: { name: 'productId', type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // This isn't production and we don't want to keep things around after a demo
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_IMAGE, // Stream the new and updated items - this will feed into search
    });

    const searcherLambda = this.createSearchLambda(props.searchDomain);

    const restApi = new apigateway.LambdaRestApi(this, 'ProductApi', {
      handler: searcherLambda,
      proxy: false
    });

    const search = restApi.root.addResource('search');
    search.addMethod('GET');

    new cdk.CfnOutput(this, 'ProductCatalogueRestApi', {
      value: restApi.url,
    });
  }

  createSearchLambda(searchDomain: string) : lambdanode.NodejsFunction {
    const searcherLambda = new lambdanode.NodejsFunction(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_16_X,
      architecture: lambda.Architecture.ARM_64,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        Domain: searchDomain,
        Index: 'product-index'
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: cdk.Duration.minutes(1),
    });

    searcherLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['es:ESHttpGet'],
      resources: ['*']
    }));

    // Need access to the data - so add the data policy for the role
    new ops.CfnAccessPolicy(this, 'SearchDataPolicy', {
      name: 'search-data-policy',
      policy: `[{"Description": "Access from lambda role to get", "Rules":[{"ResourceType":"index","Resource":["index/product-collection/*"],"Permission":["aoss:*"]}, {"ResourceType":"collection","Resource":["collection/product-collection"],"Permission":["aoss:*"]}], "Principal":["${searcherLambda.role?.roleArn}"]}]`,
      type: 'data'
    });

    return searcherLambda;
  }
}