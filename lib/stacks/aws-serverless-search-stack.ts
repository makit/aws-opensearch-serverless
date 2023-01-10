import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import IndexerConstruct from '../constructs/indexer/indexer-construct';
import OpenSearchConstruct from '../constructs/opensearch/opensearch-construct';
import ProductConstruct from '../constructs/product/product-construct';

export class AwsServerlessSearchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const searchConstruct = new OpenSearchConstruct(this, 'OpenSearchConstruct');

    const productCatalogueConstruct = new ProductConstruct(this, 'ProductCatalogueConstruct', {
      searchDomain: searchConstruct.searchDomain,
    });

    new IndexerConstruct(this, 'IndexerConstruct', {
      productTable: productCatalogueConstruct.productTable,
      searchDomain: searchConstruct.searchDomain,
    });
  }
}
