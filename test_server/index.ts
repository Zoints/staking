import { Stake } from './staking/app';
import * as express from 'express';
import { wrap } from './view';

const app = express.default();
const port = 8080;

const staking = new Stake(
    'http://localhost:8899',
    '../program/target/deploy/staking.so',
    './seed.json'
);

app.get('/', (req: express.Request, res: express.Response) => {
    res.send(wrap(staking, 'Hello World'));
});

app.listen(port, async () => {
    await staking.setup();

    console.log(`Server started at http://localhost:${port}`);
});
