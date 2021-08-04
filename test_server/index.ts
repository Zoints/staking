import { App } from './staking/app';
import * as express from 'express';
import { viewSettings, viewCommunity, wrap, viewStaker } from './view';
import { EngineDirect } from './staking/engine-direct';
import { EngineBackend } from './staking/engine-backend';

const app = express.default();
const port = 8081;

const engine =
    process.env.ENGINE?.toLowerCase() === 'direct'
        ? new EngineDirect()
        : new EngineBackend('http://localhost:8080/staking/v1/');
console.log(
    `Engine: ${process.env.ENGINE === 'direct' ? 'direct' : 'backend'}`
);

const staking = new App(
    'http://localhost:8899',
    '../program/target/deploy/staking.so',
    './seed.json',
    engine
);

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: false }));

app.get('/reload', async (req: express.Request, res: express.Response) => {
    await staking.regenerate();
    res.redirect('/');
});

app.get('/reloadBPF', async (req: express.Request, res: express.Response) => {
    await staking.loadBPF();
    res.redirect('/');
});

app.get(
    '/community/:id',
    async (req: express.Request, res: express.Response) => {
        const id = Number(req.params.id);
        if (id >= staking.communities.length) {
            console.log(`tried to access nonexistent community`);
            res.redirect('/');
            return;
        }

        res.send(await wrap(staking, await viewCommunity(staking, id)));
    }
);

app.get(
    '/addCommunity',
    async (req: express.Request, res: express.Response) => {
        const noSecondary = req.query.nosec === 'true';
        await staking.addCommunity(noSecondary);
        res.redirect('/');
    }
);

app.get('/staker/:id', async (req: express.Request, res: express.Response) => {
    const id = Number(req.params.id);
    if (id >= staking.stakers.length) {
        console.log(`tried to access nonexistent staker`);
        res.redirect('/');
        return;
    }
    res.send(await wrap(staking, await viewStaker(staking, id)));
});

app.get('/addStaker', async (req: express.Request, res: express.Response) => {
    await staking.addStaker();
    res.redirect('/');
});

app.post(
    '/stake/:community/:staker',
    async (req: express.Request, res: express.Response) => {
        const amount = Number(req.body.amount);
        const community = Number(req.params.community);
        const staker = Number(req.params.staker);

        await staking.stake(community, staker, amount);
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

app.get(
    '/multiclaim/:staker',
    async (req: express.Request, res: express.Response) => {
        const staker = Number(req.params.staker);
        await staking.claimStaker(staker);
        res.redirect('/staker/' + staker);
    }
);

app.get('/claim/fee', async (req: express.Request, res: express.Response) => {
    await staking.claimFee();
    res.redirect('/');
});

app.get(
    '/claim/:community/:primary',
    async (req: express.Request, res: express.Response) => {
        const community = Number(req.params.community);
        if (req.params.primary === 'primary') {
            await staking.claimPrimary(community);
        } else {
            await staking.claimSecondary(community);
        }
        res.redirect('/community/' + community);
    }
);

app.get('/airdrop/:id', async (req: express.Request, res: express.Response) => {
    const amount = Number(req.query.amount);
    const id = Number(req.params.id);
    await staking.airdrop(id, amount);
    res.redirect('/staker/' + id);
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
