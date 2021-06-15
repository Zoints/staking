import { Connection, PublicKey } from '@solana/web3.js';
import * as borsh from 'borsh';
import { Settings } from '../js/src';

const connection = new Connection('http://localhost:8899');

(async () => {
    const account = await connection.getAccountInfo(
        new PublicKey('CCf7RxPHTVAuxxikKQ5dCQBbtjxP9ssg2Umw7qvRZ1ch')
    );
    if (account === null) {
        console.log(`Account not found`);
        process.exit(1);
    }

    console.log(account.data);

    const settings = borsh.deserialize(Settings.schema, Settings, account.data);

    console.log(settings);
})();
