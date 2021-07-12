import { sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { Instruction, ZERO_KEY } from '@zoints/staking';
import { App, Claims } from './app';
import { AppCommunity, AppStaker } from './community';
import { StakeEngine } from './engine';
import axios, { AxiosInstance } from 'axios';
import nacl from 'tweetnacl';
import { Token } from '@solana/spl-token';

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
        const userSig = nacl.sign.detached(data, community.authority.secretKey);
        const commSig = nacl.sign.detached(data, community.key.secretKey);

        const result = await this.client.post('community/register', {
            seed: prep.data.seed,
            message: prep.data.message,
            userSignature: Buffer.from(userSig).toString('base64'),
            communitySignature: Buffer.from(commSig).toString('base64')
        });

        console.log(
            `Community create:\n\tsig: ${result.data.txSignature}\n\tcommunity: ${result.data.community}`
        );
    }

    async claim(
        app: App,
        claim: Claims,
        community: AppCommunity
    ): Promise<void> {
        if (claim == Claims.Fee) {
            await app.token.getOrCreateAssociatedAccountInfo(
                app.fee_authority.publicKey
            );

            const result = await this.client.post(`claim`);

            console.log(`Claimed global fee: ${result.data.txSignature}`);
        } else {
            const primary = claim === Claims.Primary;
            const prep = await this.client.post(
                `community/${community.key.publicKey.toBase58()}/claim/prepare`,
                {
                    fund: true,
                    type: primary ? 'primary' : 'secondary'
                }
            );

            const data = Buffer.from(prep.data.message, 'base64');
            const userSig = nacl.sign.detached(
                data,
                primary
                    ? community.primaryAuthority.secretKey
                    : community.secondaryAuthority.secretKey
            );

            const result = await this.client.post(
                `community/${community.key.publicKey.toBase58()}/claim`,
                {
                    message: prep.data.message,
                    userSignature: Buffer.from(userSig).toString('base64')
                }
            );

            console.log(
                `Claimed primary=${primary} harvest for community ${community.key.publicKey.toBase58()}: ${
                    result.data.txSignature
                }`
            );
        }
    }
    async stake(
        app: App,
        community: AppCommunity,
        staker: AppStaker,
        amount: number
    ): Promise<void> {
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

        const userSig = nacl.sign.detached(
            Buffer.from(prep.data.message, 'base64'),
            staker.key.secretKey
        );

        const result = await this.client.post(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake`,
            {
                userSignature: Buffer.from(userSig).toString('base64'),
                message: prep.data.message
            }
        );

        console.log(`Stake result: ${result.data.txSignature}`);
    }

    async withdraw(
        app: App,
        community: AppCommunity,
        staker: AppStaker
    ): Promise<void> {
        const prep = await this.client.post(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/withdraw/prepare`,
            {
                fund: true
            }
        );

        const userSig = nacl.sign.detached(
            Buffer.from(prep.data.message, 'base64'),
            staker.key.secretKey
        );

        const result = await this.client.post(
            `stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/withdraw`,
            {
                userSignature: Buffer.from(userSig).toString('base64'),
                message: prep.data.message
            }
        );

        console.log(`Withdraw result: ${result.data.txSignature}`);
    }
}
