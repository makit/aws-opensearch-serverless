import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ops from 'aws-cdk-lib/aws-opensearchserverless';

export default class OpenSearchConstruct extends Construct {

  public readonly searchDomain: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // See https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-manage.html
    const collection = new ops.CfnCollection(this, 'ProductSearchCollection', {
      name: 'product-collection',
      type: 'SEARCH',
    });

    // Encryption policy is needed in order for the collection to be created
    const encPolicy = new ops.CfnSecurityPolicy(this, 'ProductSecurityPolicy', {
      name: 'product-collection-policy',
      policy: '{"Rules":[{"ResourceType":"collection","Resource":["collection/product-collection"]}],"AWSOwnedKey":true}',
      type: 'encryption'
    });
    collection.addDependency(encPolicy);

    // Network policy is required so that the dashboard can be viewed!
    const netPolicy = new ops.CfnSecurityPolicy(this, 'ProductNetworkPolicy', {
      name: 'product-network-policy',
      policy: '[{"Rules":[{"ResourceType":"collection","Resource":["collection/product-collection"]}, {"ResourceType":"dashboard","Resource":["collection/product-collection"]}],"AllowFromPublic":true}]',
      type: 'network'
    });
    collection.addDependency(netPolicy);

    this.searchDomain = collection.attrCollectionEndpoint;

    new cdk.CfnOutput(this, 'DashboardEndpoint', {
      value: collection.attrDashboardEndpoint,
    });
  }
}