import * as ddb from 'aws-lambda/trigger/dynamodb-stream';
import * as os from '@opensearch-project/opensearch';
import * as aws4 from 'aws4';

class Indexer {
  private readonly _index: string;
  private readonly _domain: string;
  private readonly _region: string;

  private _openSearch: os.Client;

  constructor() {
    const { Domain, Index, AWS_REGION } = process.env;

    if (!Domain || !Index || !AWS_REGION) {
      throw new Error('Missing environment variables');
    }

    this._index = Index;
    this._domain = Domain;
    this._region = AWS_REGION;

    console.info('Initialised');
  }

  handler = async (event: ddb.DynamoDBStreamEvent): Promise<ddb.DynamoDBBatchResponse> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    if (!this._openSearch) {
      this._openSearch = await this.getClient();
    }

    const batchItemFailures: ddb.DynamoDBBatchResponse = {batchItemFailures: []};

    for (const record of event.Records) {
      const indexResult = await this.indexRecord(record);

      // A result that isn't undefined will be a failure that we should return
      if (indexResult) {
        batchItemFailures.batchItemFailures.push({ itemIdentifier: indexResult });
      }
    }
    
    return batchItemFailures;
  };

  indexRecord = async (record: ddb.DynamoDBRecord): Promise<string | undefined> => {
    
    const productId = record.dynamodb?.Keys?.productId.N;
    if(!productId) {
      console.error('No product ID');
      return record.eventID;
    }
    
    try {
      if (record.eventName === "REMOVE") {
        await this.deleteDoc(productId);
      } else {

        if (!record.dynamodb?.NewImage) {
          throw new Error('Missing image');
        }

        var dynamoRow = record.dynamodb?.NewImage;

        var productToAdd = {
          productId: dynamoRow.productId?.N,
          price: dynamoRow.price?.N,
          title: dynamoRow.title?.S,
          description: dynamoRow.description?.S,
        }
        
        await this.indexDoc(productId, productToAdd);
      }
    } catch (error) {
      console.error('Error processing record', JSON.stringify(record, null, 2), 'ERROR', JSON.stringify(error, null, 2));
      return record.eventID;
    }

    return undefined;
  };

  indexDoc = async (productId: string, doc: any) => {
    var response = await this._openSearch.index({
      id: productId,
      index: this._index,
      body: doc,
    });
    console.info("Added document:", response.body);
  }
  
  deleteDoc = async (productId: string) => {
    var response = await this._openSearch.delete({
      index: this._index,
      id: productId,
    });
    console.info("Deleted document:", response.body);
  }
  
  getClient = async () => {
    const region = this._region;
    return new os.Client({
        node: this._domain,
        Connection: class AmazonConnection extends os.Connection {
          buildRequestObject(params: any) {
            let request = super.buildRequestObject(params) as aws4.Request;
            request.service = 'aoss';
            request.region = region;
            request.headers = request.headers || {};

            var body = request.body;
            delete request.headers['content-length'];
            request.body = undefined;

            const signedRequest = aws4.sign(request);
            signedRequest.body = body;

            return signedRequest;
          }
      }
    });
  }
}

// Initialise class outside of the handler so context is reused.
const indexer = new Indexer();

// The handler simply executes the object handler
export const handler = async (event: ddb.DynamoDBStreamEvent): Promise<ddb.DynamoDBBatchResponse> => indexer.handler(event);