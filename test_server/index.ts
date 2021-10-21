import { App } from './staking/app';
import * as express from 'express';
import { viewEndpoint, wrap, viewWallet } from './view';
import { EngineDirect } from './staking/engine-direct';
import { Authority, AuthorityType } from '@zoints/staking';
import { PublicKey } from '@solana/web3.js';
//import { EngineBackend } from './staking/engine-backend';

const app = express.default();
const port = 8081;

const engine = new EngineDirect();
/*  process.env.ENGINE?.toLowerCase() === 'direct'
        ? new EngineDirect()
        : new EngineBackend('http://localhost:8080/');*/
console.log(
    `Engine: ${process.env.ENGINE === 'direct' ? 'direct' : 'backend'}`
);

const staking = new App(
    'http://localhost:8899',
    '../program/target/deploy/staking.so',
    './seed.txt',
    engine
);

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: false }));

app.get(
    '/endpoint/:id',
    async (req: express.Request, res: express.Response) => {
        const id = Number(req.params.id);
        if (id >= staking.endpoints.length) {
            console.log(`tried to access nonexistent endpoint`);
            res.redirect('/');
            return;
        }

        res.send(await wrap(staking, await viewEndpoint(staking, id)));
    }
);

app.get('/addEndpoint', async (req: express.Request, res: express.Response) => {
    let type: number;
    let id: number;
    if (typeof req.query.owner === 'string') {
        const split = req.query.owner.split('-');
        type = Number(split[0]);
        id = Number(split[1]);
    } else {
        type = 0;
        id = await staking.addWallet();
    }
    let primary = Number(req.query.primary);
    if (primary < 0) {
        primary = await staking.addWallet();
    }
    let secondary = Number(req.query.secondary);
    if (secondary < 0) {
        secondary = await staking.addWallet();
    }

    await staking.addEndpoint(type, id, primary, secondary);
    res.redirect('/');
});

app.get('/wallet/:id', async (req: express.Request, res: express.Response) => {
    const id = Number(req.params.id);
    if (id >= staking.wallets.length) {
        console.log(`tried to access nonexistent wallet`);
        res.redirect('/');
        return;
    }
    res.send(await wrap(staking, await viewWallet(staking, id)));
});

app.get('/addWallet', async (req: express.Request, res: express.Response) => {
    const id = await staking.addWallet();
    res.redirect('/wallet/' + id);
});

app.get('/addNFT/:id', async (req: express.Request, res: express.Response) => {
    await staking.addNFT(Number(req.params.id));
    res.redirect('/wallet/' + req.params.id);
});

app.get('/claim/:id', async (req: express.Request, res: express.Response) => {
    await staking.claimWallet(Number(req.params.id));
    res.redirect('/wallet/' + req.params.id);
});

app.post(
    '/stake/:endpoint/:staker',
    async (req: express.Request, res: express.Response) => {
        const amount = Number(req.body.amount);
        const endpoint = Number(req.params.endpoint);
        const staker = Number(req.params.staker);

        await staking.stake(endpoint, staker, amount);
        res.redirect('/staker/' + staker);
    }
);

app.get(
    '/withdraw/:community/:staker',
    async (req: express.Request, res: express.Response) => {
        const community = Number(req.params.community);
        const staker = Number(req.params.staker);

        await staking.withdrawUnbond(community, staker);
        res.redirect('/staker/' + staker);
    }
);

app.get('/airdrop/:id', async (req: express.Request, res: express.Response) => {
    const amount = Number(req.query.amount);
    const id = Number(req.params.id);
    await staking.airdrop(id, amount);
    res.redirect('/wallet/' + id);
});

app.get('/', async (req: express.Request, res: express.Response) => {
    res.send(await wrap(staking, 'Hello World'));
});

app.listen(port, async () => {
    await staking.setup();

    console.log(`Server started at http://localhost:${port}`);
});
