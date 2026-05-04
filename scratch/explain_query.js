const { MongoClient } = require('mongodb');

async function run() {
    const uri = "mongodb+srv://viswasurya01:Vissu1234%25@cluster0.0ecxwdw.mongodb.net/280?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('280');
        const collection = database.collection('restaurants');

        const query = { name_normalized: "campus bites" };
        const explainResult = await collection.find(query).explain("executionStats");

        console.log(JSON.stringify(explainResult, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();
