let fs = require('fs');
let yargs = require('yargs');
let getDatabasePool = require('./index').getDatabasePool;
let facetsFile = fs.readFileSync(`${__dirname}/funnelKeywords/facetBackup.json`).toString();
let causationFile = fs.readFileSync(`${__dirname}/funnelKeywords/causationBackup.json`).toString();

async function initializeFunnel(envFileName) {
    let pgPool = await getDatabasePool(envFileName);
    let client;

    try {
        client = await pgPool.connect();
        await client.query(`INSERT INTO funnel.facets (
            SELECT * from jsonb_populate_recordset(NULL::funnel.facets, $1)
        )
        ON CONFLICT (id) DO NOTHING;
        `, [facetsFile]);

        await client.query(`INSERT INTO funnel.facet_boolean_keywords (
            SELECT * from jsonb_populate_recordset(NULL::funnel.facet_boolean_keywords, $1)
        )
        ON CONFLICT (id) DO UPDATE
        SET facet_id = excluded.facet_id,
        value = excluded.value,
        whole_word = excluded.whole_word;
        `, [causationFile]);
    }

    catch(error) {
        console.log(error);
        throw error;
    }

    finally {
        client && await client.release();
    }
}

if(require.main === module) {
    let argv = yargs.argv;

    initializeFunnel(argv.env)
    .then(() => {
        console.log('seeding completed.');
        process.exit();
    })
    .catch((error) => {
        console.log(error);
        process.exit();
    });
}

else {
    throw new Error('seedDB is meant to be used as a standalone script.');
}
