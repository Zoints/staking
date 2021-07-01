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

    async claimPrimary(app: App, community: AppCommunity): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            community.primaryAuthority.publicKey
        );
        const trans = new Transaction();
        trans.add(
            await Instruction.ClaimPrimary(
                app.program_id,
                app.funder.publicKey,
                community.primaryAuthority.publicKey,
                assoc.address,
                community.key.publicKey,
                app.mint_id.publicKey
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            community.primaryAuthority
        ]);

        console.log(
            `Claimed Primary Harvest ${community.key.publicKey.toBase58()}: ${sig}`
        );
    }
    async claimSecondary(app: App, community: AppCommunity): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            community.secondaryAuthority.publicKey
        );
        const trans = new Transaction();
        trans.add(
            await Instruction.ClaimSecondary(
                app.program_id,
                app.funder.publicKey,
                community.secondaryAuthority.publicKey,
                assoc.address,
                community.key.publicKey,
                app.mint_id.publicKey
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            community.secondaryAuthority
        ]);

        console.log(
            `Claimed Secondary Harvest ${community.key.publicKey.toBase58()}: ${sig}`
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

        console.log(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake/prepare`
        );

        const prep = await this.client.post(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake/prepare`,
            {
                fund: true,
                amount
            }
        );
        console.log(
            `Stake prep: \n\trecent: ${prep.data.recent}\n\tmessage: ${prep.data.message}\n\ttransaction: ${prep.data.transaction}\n\tinitialize: ${prep.data.initialize}`
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
                transaction: prep.data.transaction
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
