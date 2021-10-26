import { App } from '../staking/app';
import { EngineDirect } from '../staking/engine-direct';

const app = new App(
    'https://dummy.com/',
    'dummy',
    'seed.txt',
    new EngineDirect()
);
console.log(`Program ID: ${app.deploy_key.publicKey.toBase58()}`);
console.log(`Deploy Key.json: [${app.deploy_key.secretKey.join(',')}]`);
console.log(`Funder: ${app.funder.publicKey.toBase58()}`);
