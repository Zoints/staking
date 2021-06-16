import { Stake } from './staking/app';
import * as express from 'express';
import { viewSettings, viewCommunity, wrap } from './view';

const app = express.default();
const port = 8080;

const staking = new Stake(
    'http://localhost:8899',
    '../program/target/deploy/staking.so',
    './seed.json'
);

app.get('/reload', async (req: express.Request, res: express.Response) => {
    await staking.regenerate();
    res.redirect('/');
});

app.get(
    '/community/:id',
    async (req: express.Request, res: express.Response) => {
        const id = Number(req.params.id);

        res.send(await wrap(staking, await viewCommunity(staking, id)));
    }
);

app.get(
    '/addCommunity',
    async (req: express.Request, res: express.Response) => {
        await staking.addCommunity();
        res.redirect('/');
    }
);

app.get('/addStaker', async (req: express.Request, res: express.Response) => {
    await staking.addStaker();
    res.redirect('/');
});

app.get('/settings', async (req: express.Request, res: express.Response) => {
    res.send(await wrap(staking, await viewSettings(staking)));
});

app.get('/', async (req: express.Request, res: express.Response) => {
    res.send(await wrap(staking, 'Hello World'));
});

app.listen(port, async () => {
    await staking.setup();

    console.log(`Server started at http://localhost:${port}`);
});
