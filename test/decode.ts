import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as borsh from 'borsh';
import { Community, Settings } from '../js/src';

const connection = new Connection('http://localhost:8899');

async function ga(key: PublicKey): Promise<AccountInfo<Buffer>> {
    const account = await connection.getAccountInfo(key);
    if (account === null) {
        console.log(`Account ${key.toBase58()} not found`);
        process.exit(1);
    }
    return account;
}

(async () => {
    /*    const account = await connection.getAccountInfo(
        new PublicKey('CCf7RxPHTVAuxxikKQ5dCQBbtjxP9ssg2Umw7qvRZ1ch')
    );
    if (account === null) {
        console.log(`Account not found`);
        process.exit(1);
    }

    console.log(account.data);

    const settings = borsh.deserialize(Settings.schema, Settings, account.data);

    console.log(settings);*/

    const account = await ga(
        new PublicKey('DVA7e558tCJChjBi7kyMAdP77WW4f3EuT3iUJxgf6zh2')
    );

    const community = borsh.deserialize(
        Community.schema,
        Community,
        account.data
    );

    console.log(community);
    const tmp = new BN(community.primary.staked);
    console.log(tmp.toNumber());
})();
