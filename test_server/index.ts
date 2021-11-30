import { App } from './staking/app';
import * as express from 'express';
import { viewEndpoint, wrap, viewWallet, viewNFT } from './view';
import { EngineDirect } from './staking/engine-direct';
import { Authority } from '@zoints/staking';
import { clusterApiUrl, PublicKey } from '@solana/web3.js';
import { EngineBackendV2 } from './staking/engine-backend-v2';

const app = express.default();
const port = 8081;

const engine =
    process.env.ENGINE?.toLowerCase() === 'backend'
        ? new EngineBackendV2('http://localhost:8080/')
        : new EngineDirect();
console.log(
    `Engine: ${
        process.env.ENGINE?.toLowerCase() === 'backend'
            ? 'backend v2'
            : 'direct'
    }`
);

const url = process.env.DEVNET
    ? clusterApiUrl('devnet')
    : 'http://localhost:8899';
const staking = new App(
    url,
    '../program/target/deploy/staking.so',
    './seed.txt',
    engine
);

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: false }));

app.get(
    '/resolve/:pubkey',
    async (req: express.Request, res: express.Response) => {
        const pk = req.params.pubkey;
        const key = new PublicKey(pk);

        for (let id = 0; id < staking.wallets.length; id++) {
            console.log(staking.wallets[id].publicKey, key);
            if (staking.wallets[id].publicKey.equals(key)) {
                res.redirect('/wallet/' + id);
                return;
            }
        }

        for (let id = 0; id < staking.nfts.length; id++) {
            if (staking.nfts[id].publicKey.equals(key)) {
                res.redirect('/nft/' + id);
                return;
            }
        }

        for (let id = 0; id < staking.endpoints.length; id++) {
            if (staking.endpoints[id].publicKey.equals(key)) {
                res.redirect('/endpoint/' + id);
                return;
            }
        }

        res.send(await wrap(staking, `unable to find pubkey ${pk} anywhere`));
    }
);

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
    if (secondary == -1) {
        secondary = await staking.addWallet();
    }

    const newid = await staking.addEndpoint(type, id, primary, secondary);
    res.redirect('/endpoint/' + newid);
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

app.get('/nft/:id', async (req: express.Request, res: express.Response) => {
    const id = Number(req.params.id);
    if (id >= staking.nfts.length) {
        console.log(`tried to access nonexistent nft`);
        res.redirect('/');
        return;
    }
    res.send(await wrap(staking, await viewNFT(staking, id)));
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
        res.redirect('/wallet/' + staker);
    }
);

app.get(
    '/withdraw/:community/:staker',
    async (req: express.Request, res: express.Response) => {
        const community = Number(req.params.community);
        const staker = Number(req.params.staker);

        await staking.withdrawUnbond(community, staker);
        res.redirect('/wallet/' + staker);
    }
);

app.get('/airdrop/:id', async (req: express.Request, res: express.Response) => {
    const amount = Number(req.query.amount);
    const id = Number(req.params.id);
    await staking.airdrop(id, amount);
    res.redirect('/wallet/' + id);
});

app.post(
    '/transfer/:id',
    async (req: express.Request, res: express.Response) => {
        const id = Number(req.params.id);

        const pubkey = staking.endpoints[id].publicKey;
        const { owner, ownerSigner } =
            await staking.getEndpointOwnerAndOwnerSigner(id);

        const [rType, rId] = String(req.body.newOwner).split('-');
        let recipient: Authority;
        if (rType == '1') {
            recipient = Authority.NFT(staking.nfts[Number(rId)].publicKey);
        } else {
            recipient = Authority.Basic(staking.wallets[Number(rId)].publicKey);
        }

        await staking.engine.transfer(
            staking,
            pubkey,
            owner,
            ownerSigner,
            recipient
        );

        res.redirect('/endpoint/' + id);
    }
);

app.post(
    '/change-beneficiaries/:id',
    async (req: express.Request, res: express.Response) => {
        const id = Number(req.params.id);
        let pid = Number(req.body.primary);
        const sid = Number(req.body.secondary);

        if (pid < 0) {
            pid = await staking.addWallet();
        }
        let secondary = PublicKey.default;
        if (sid < 0) {
            if (sid == -1) {
                const id = await staking.addWallet();
                secondary = staking.wallets[id].publicKey;
            }
            // leave it default
        } else {
            secondary = staking.wallets[sid].publicKey;
        }

        const pubkey = staking.endpoints[id].publicKey;

        const { owner, ownerSigner } =
            await staking.getEndpointOwnerAndOwnerSigner(id);

        const endpoint = await staking.staking.getEndpoint(pubkey);
        await staking.engine.changeBeneficiaries(
            staking,
            pubkey,
            owner,
            ownerSigner,
            endpoint.primary,
            endpoint.secondary,
            staking.wallets[pid].publicKey,
            secondary
        );

        res.redirect('/endpoint/' + id);
    }
);

app.get('/', async (req: express.Request, res: express.Response) => {
    res.send(await wrap(staking, 'Hello World'));
});

app.listen(port, async () => {
    await staking.setup();

    console.log(`Server started at http://localhost:${port}`);
});
