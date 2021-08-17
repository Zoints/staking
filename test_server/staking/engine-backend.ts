import { Keypair } from '@solana/web3.js';
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
        this.client.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response.data.message !== undefined) {
                    return Promise.reject(
                        `http error: ${error}\n\t${error.response.data.message}`
                    );
                }
                return Promise.reject(error);
            }
        );
    }

    async registerCommunity(
        app: App,
        community: AppCommunity,
        noSecondary: boolean
    ): Promise<void> {
        const result = await this.client.post('community/register', {
            owner: community.authority.publicKey.toBase58(),
            primary: community.primaryAuthority.publicKey.toBase58(),
            secondary: community.secondaryAuthority.publicKey.toBase58(),
            seed: Buffer.from(community.key.secretKey).toString('hex')
        });

        console.log(
            `Community create:\n\tsig: ${result.data.txSignature}\n\tcommunity: ${result.data.community}`
        );
    }

    async claim(app: App, authority?: Keypair): Promise<void> {
        if (authority === undefined) {
            await app.token.getOrCreateAssociatedAccountInfo(
                app.fee_authority.publicKey
            );
            const result = await this.client.post(`claim-fee`);
            console.log(`Claimed global fee: ${result.data.txSignature}`);
        } else {
            const prep = await this.client.post(`claim/prepare`, {
                fund: true,
                authority: authority.publicKey.toBase58()
            });

            const data = Buffer.from(prep.data.message, 'base64');
            const userSig = nacl.sign.detached(data, authority.secretKey);

            const result = await this.client.post(`claim`, {
                message: prep.data.message,
                userSignature: Buffer.from(userSig).toString('base64')
            });

            if (result.data.error !== undefined) {
                console.log(`Error: ${result.data.error}`);
            } else
                console.log(
                    `Claimed harvest for authority ${authority.publicKey.toBase58()}: ${
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

        if (result.data.error !== undefined) {
            console.log(`Error: ${result.data.error}`);
        } else console.log(`Stake result: ${result.data.txSignature}`);
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

        if (result.data.error !== undefined) {
            console.log(`Error: ${result.data.error}`);
        } else console.log(`Withdraw result: ${result.data.txSignature}`);
    }
}
