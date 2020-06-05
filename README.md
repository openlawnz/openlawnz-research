# OpenLaw NZ Human Refinement Centre

This project is where humans can manually assess and process data extracted from a parser.

Create a copy of the .env.sample file as .env.local and fill it the blanks with database connection values.

Run the following commands in order.

    yarn install
    node seed --env=local
    node index --env=local

Visit: http://localhost:8082/?caseId=2
