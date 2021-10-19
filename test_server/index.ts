import { App } from './staking/app';
import * as express from 'express';
import { viewSettings, viewEndpoint, wrap, viewStaker } from './view';
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
    const [pType, pID] = req.params.primary.split('-');
    const [sType, sID] = req.params.primary.split('-');

    let primary: Authority;
    let secondary: Authority;

    switch (Number(pType)) {
        case AuthorityType.Basic:
            const wallet = staking.endpoints[Number(pID)];
            primary = new Authority({
                authorityType: AuthorityType.Basic,
                address: wallet.publicKey
            });
            break;
        case AuthorityType.NFT:
            const nft = staking.nfts[Number(pID)];
            primary = new Authority({
                authorityType: AuthorityType.NFT,
                address: nft.publicKey
            });
            break;
        default:
            primary = new Authority({
                authorityType: AuthorityType.None,
                address: PublicKey.default
            });
    }

    switch (Number(sType)) {
        case AuthorityType.Basic:
            const wallet = staking.endpoints[Number(sID)];
            secondary = new Authority({
                authorityType: AuthorityType.Basic,
                address: wallet.publicKey
            });
            break;
        case AuthorityType.NFT:
            const nft = staking.nfts[Number(sID)];
            secondary = new Authority({
                authorityType: AuthorityType.NFT,
                address: nft.publicKey
            });
            break;
        default:
            secondary = new Authority({
                authorityType: AuthorityType.None,
                address: PublicKey.default
            });
    }

    await staking.addEndpoint(primary, secondary);
    res.redirect('/');
});

app.get('/staker/:id', async (req: express.Request, res: express.Response) => {
    const id = Number(req.params.id);
    if (id >= staking.wallets.length) {
        console.log(`tried to access nonexistent staker`);
        res.redirect('/');
        return;
    }
    res.send(await wrap(staking, await viewStaker(staking, id)));
});

app.get('/addWallet', async (req: express.Request, res: express.Response) => {
    await staking.addWallet();
    res.redirect('/');
});

app.get('/addNFT/:id', async (req: express.Request, res: express.Response) => {
    await staking.addNFT(Number(req.params.id));
    res.redirect('/');
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
    res.redirect('/staker/' + id);
});

app.get('/', async (req: express.Request, res: express.Response) => {
    res.send(await wrap(staking, 'Hello World'));
});

app.listen(port, async () => {
    await staking.setup();

    console.log(`Server started at http://localhost:${port}`);
});
