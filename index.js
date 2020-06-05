let express = require('express');
let yargs = require('yargs');
let bodyParser = require('body-parser');
let { Pool } = require('pg');
let dotEnv = require('dotenv');

function isNullOrUndefined(subject){ 
  return subject === null || subject === undefined
};


async function getDatabasePool(envFileName) {
  if (!envFileName) {
    throw new Error('Missing env file name.');
  }

  let envResult = dotEnv.config({
      path: `${__dirname}/.env.${envFileName}`,
      encoding: 'utf8'
  });

  if(envResult.error) {
      throw envResult.error;
  }

  if(isNullOrUndefined(process.env["DB_HOST"]) ||
      isNullOrUndefined(process.env["DB_NAME"]) ||
      isNullOrUndefined(process.env["DB_PASS"]) ||
      isNullOrUndefined(process.env["DB_USER"]) ||
      isNullOrUndefined(process.env["PORT"])) {
          
      throw new Error(`Missing required line/s in env file ${envFileName}`);
  }

  const conn = {
      host: process.env["DB_HOST"],
      database: process.env["DB_NAME"],
      port: process.env["PORT"],
      user: process.env["DB_USER"],
      password: process.env["DB_PASS"],
      client_encoding: "utf8"
  };

  let pgPool = new Pool(conn);
  return pgPool;
};
module.exports.getDatabasePool = getDatabasePool;

async function commonGetRoute(response, pgPool, allQuery) {
  let client;

  try {
      client = await pgPool.connect();
      let result = await client.query(allQuery);

      response.send({
          recordCount: result.rows.length,
          rows: result.rows                        
      });
  }

  catch(error) {
      console.log(error);
      response.status(500).send(error.toString());
  }

  finally {
      client && await client.release();
  }
};

async function postFunnels(request, response, pgPool) {
  let client;
  let chosenTable = '';

  try {
      switch(request.body.facetType) {
          case 'boolean':
              chosenTable = 'boolean_facet_values';
              break;

          case 'date':
              chosenTable = 'date_facet_values';
              break;

          default:
              return response.status(405).send(`invalid facet type: ${request.body.facetType}`);
      }
      client = await pgPool.connect();

      let metadataResult = await client.query(`INSERT INTO funnel.facet_value_metadata 
                          (facet_id, user_id, date_recorded, case_id)
                          VALUES ($1, $2, $3, $4)
                          RETURNING id;`,
                          [request.body.facetId, 1, new Date(), request.body.caseId])

      let chosenResult = await client.query(`INSERT INTO funnel.${chosenTable} (metadata_id, value)
                          VALUES ($1, $2)
                          RETURNING id;`,
                          [metadataResult.rows[0].id, request.body.outcome]);
      return response.status(200).send(`inserted row in ${chosenTable} table with id: ${chosenResult.rows[0].id}`);
  }

  catch(error) {
      console.log(error);
      return response.status(500).send(error.toString());
  }

  finally {
      client && await client.release();
  }
};

async function app(environmentLabel) {
  let expressInstance = express();
  let pgPool = await getDatabasePool(environmentLabel);
  expressInstance.use(bodyParser.json());
  expressInstance.use(express.static(`${__dirname}/public`));
  expressInstance.get('/cases', (request, response) => commonGetRoute(response, pgPool, 
    `SELECT C.id, P.pdf_url
    FROM main.v_pdfs P
    INNER JOIN main.cases C ON C.pdf_id = P.pdf_id
    WHERE C.id NOT IN ( --dont return cases that have already been processed
      SELECT case_id
      FROM funnel.facet_value_metadata
    );`  
  ));
  expressInstance.get('/funnels', (request, response) => commonGetRoute(response, pgPool, 
    `SELECT 
      F.id AS facetId, 
      F.name AS facetName,
      FBK.value AS keyword, 
      FBK.whole_word as wholeWord
    FROM funnel.facets F
    LEFT JOIN funnel.facet_boolean_keywords FBK ON F.id = FBK.facet_id;`
    ));
  expressInstance.post('/funnels', (request, response) => postFunnels(request, response, pgPool));
  expressInstance.listen(8082, () => console.log(`refinement-centre listening on port ${8082}!`));
}

if(require.main === module) {
  let argv = yargs.argv;

  app(argv.env)
  .catch((error) => {
    console.log(error);
    process.exit();
  })
}
