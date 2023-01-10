import * as agp from 'aws-lambda/trigger/api-gateway-proxy';
import * as os from '@opensearch-project/opensearch';
import * as aws4 from 'aws4';

class Searcher {
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

  handler = async (event: agp.APIGatewayProxyEvent): Promise<agp.APIGatewayProxyResult> => {
    console.info('Received Event:', JSON.stringify(event, null, 2));

    if (!event.queryStringParameters?.query) {
      return {
        statusCode: 400,
        headers: {
            "Access-Control-Allow-Origin": '*'
        },
        isBase64Encoded: false,
        body: 'Missing Query'
      };
    }

    if (!this._openSearch) {
      this._openSearch = await this.getClient();
    }

    var query = {
      size: 20,
      query: {
        multi_match: {
          query: event.queryStringParameters?.query,
          fields: ['title^2', 'description', 'price'],
          lenient: true,
          fuzziness: 2,
        },
      },
    };

    var response = await this._openSearch.search({
      index: this._index,
      body: query,
    });

    return {
      statusCode: 200,
      headers: {
          "Access-Control-Allow-Origin": '*'
      },
      isBase64Encoded: false,
      body: JSON.stringify(response.body.hits, null, 2),
    };
  };

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
const searcher = new Searcher();

// The handler simply executes the object handler
export const handler = async (event: agp.APIGatewayProxyEvent): Promise<agp.APIGatewayProxyResult> => searcher.handler(event);