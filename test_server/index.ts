import { Stake } from './staking/app';

const express = require('express');
const app = express();
const port = 8080;

const staking = new Stake('http://localhost:8899');

app.listen(port, async () => {
    console.log(`Initializing Program`);

    staking.fund();
    staking.loadBPF('../program/target/deploy/staking.so');

    console.log(`Server started at http://localhost:${port}`);
});
