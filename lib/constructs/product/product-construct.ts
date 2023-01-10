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

    // Ref: https://serverlessland.com/patterns/apigw-dynamodb-cdk
    // const restApi = new apigateway.RestApi(this, 'ApiDynamoRestApi')
    // const resource = restApi.root.addResource('{id}')

    // Allow the RestApi to access DynamoDb by assigning this role to the integration
    // const integrationRole = new iam.Role(this, 'IntegrationRole', {
    //   assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    // })
    // this.productTable.grantReadData(integrationRole)

    // GET Integration with DynamoDb
    // const dynamoQueryIntegration = new apigateway.AwsIntegration({
    //   service: 'dynamodb',
    //   action: 'Query',
    //   options: {
    //     passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
    //     credentialsRole: integrationRole,
    //     requestParameters: {
    //       'integration.request.path.id': 'method.request.path.id'
    //     },
    //     requestTemplates: {
    //       'application/json': JSON.stringify({
    //           'TableName': this.productTable.tableName,
    //           'KeyConditionExpression': 'productId = :v1',
    //           'ExpressionAttributeValues': {
    //               ':v1': {'N': "$input.params('id')"}
    //           }
    //       }),
    //     },
    //     integrationResponses: [{ statusCode: '200' }],
    //   }
    // })
    // resource.addMethod('GET', dynamoQueryIntegration, {
    //   methodResponses: [{ statusCode: '200' }],
    //   requestParameters: {
    //     'method.request.path.id': true
    //   }
    // });

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