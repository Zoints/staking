import { sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { Instruction, ZERO_KEY } from '@zoints/staking';
import { App } from './app';
import { AppCommunity, AppStaker } from './community';
import { StakeEngine } from './engine';
import axios, { AxiosInstance } from 'axios';
import nacl from 'tweetnacl';

export class EngineBackend implements StakeEngine {
    url: string;
    client: AxiosInstance;

    constructor(url: string) {
        this.url = url;
        this.client = axios.create({
            baseURL: url,
            timeout: 30000
            // todo: auth
        });
    }

    async registerCommunity(
        app: App,
        community: AppCommunity,
        noSecondary: boolean
    ): Promise<void> {
        const prep = await this.client.post('community/register/prepare', {
            fund: true,
            owner: community.authority.publicKey.toBase58(),
            primary: community.primaryAuthority.publicKey.toBase58(),
            secondary: community.secondaryAuthority.publicKey.toBase58(),
            community: community.key.publicKey.toBase58()
        });

        console.log(
            `Community create prep: \n\tseed: ${prep.data.seed}\n\tmessage: ${prep.data.message}\n\tcommunity: ${prep.data.community}`
        );

        const data = Buffer.from(prep.data.message, 'base64');
        const sig = nacl.sign.detached(data, community.authority.secretKey);
        const commSig = nacl.sign.detached(data, community.key.secretKey);

        const result = await this.client.post('community/register', {
            seed: prep.data.seed,
            message: prep.data.message,
            sig: Buffer.from(sig).toString('base64'),
            communitySig: Buffer.from(commSig).toString('base64')
        });

        console.log(
            `Community create:\n\tsig: ${result.data.signature}\n\tcommunity: ${result.data.community}`
        );
    }

    async claim(
        app: App,
        community: AppCommunity,
        primary: boolean
    ): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            community.primaryAuthority.publicKey
        );

        const prep = await this.client.post(
            `community/${community.key.publicKey.toBase58()}/claim/prepare`,
            {
                fund: true,
                type: primary ? 'primary' : 'secondary'
            }
        );

        const data = Buffer.from(prep.data.message, 'base64');
        const sig = nacl.sign.detached(
            data,
            primary
                ? community.primaryAuthority.secretKey
                : community.secondaryAuthority.secretKey
        );

        const result = await this.client.post(
            `community/${community.key.publicKey.toBase58()}/claim`,
            {
                message: prep.data.message,
                sig: Buffer.from(sig).toString('base64')
            }
        );

        console.log(
            `Claimed primary=${primary} harvest for community ${community.key.publicKey.toBase58()}: ${
                result.data.signature
            }`
        );
    }
    async stake(
        app: App,
        community: AppCommunity,
        staker: AppStaker,
        amount: number
    ): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            staker.key.publicKey
        );

        const prep = await this.client.post(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake/prepare`,
            {
                fund: true,
                amount
            }
        );
        console.log(
            `Stake prep: \n\trecent: ${prep.data.recent}\n\tmessage: ${prep.data.message}\n\tinitialize: ${prep.data.initialize}`
        );

        const sig = nacl.sign.detached(
            Buffer.from(prep.data.message, 'base64'),
            staker.key.secretKey
        );
        console.log(`=== signed with ${staker.key.publicKey.toString()}`);

        const result = await this.client.post(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake`,
            {
                sig: Buffer.from(sig).toString('base64'),
                message: prep.data.message
            }
        );

        console.log(`Stake result:\n\tsignature: ${result.data.signature}`);
    }

    async withdraw(
        app: App,
        community: AppCommunity,
        staker: AppStaker
    ): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            staker.key.publicKey
        );
        const trans = new Transaction();
        trans.add(
            await Instruction.WithdrawUnbond(
                app.program_id,
                app.funder.publicKey,
                staker.key.publicKey,
                assoc.address,
                community.key.publicKey
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            staker.key
        ]);

        console.log(
            `Withdraw Unbond ${community.key.publicKey.toBase58()}: ${sig}`
        );
    }
}
