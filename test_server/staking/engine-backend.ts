import { Keypair } from '@solana/web3.js';
import { App } from './app';
import { StakeEngine } from './engine';
import axios, { AxiosInstance } from 'axios';
import nacl from 'tweetnacl';

/*
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

    async get(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.client
                .get(url)
                .then((result) => resolve(result.data))
                .catch((e) => {
                    if (e.response) reject(JSON.stringify(e.response.data));
                    else reject(`unknown server error ${JSON.stringify(e)}`);
                });
        });
    }

    async post(url: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            this.client
                .post(url, params)
                .then((result) => resolve(result.data))
                .catch((e) => {
                    if (e.response) reject(JSON.stringify(e.response.data));
                    else reject(`unknown server error ${JSON.stringify(e)}`);
                });
        });
    }

    async registerCommunity(
        app: App,
        community: AppCommunity,
        noSecondary: boolean
    ): Promise<void> {
        const result = await this.post('staking/v1/community/register', {
            owner: community.authority.publicKey.toBase58(),
            primary: community.primaryAuthority.publicKey.toBase58(),
            secondary: community.secondaryAuthority.publicKey.toBase58(),
            seed: Buffer.from(community.key.secretKey).toString('hex')
        });

        const confirm = await this.get(
            `general/v1/confirm/${result.txSignature}`
        );

        console.log(
            `Community create:\n\tsig: ${result.txSignature}\n\tcommunity: ${result.community}\n\tconfirm: ${confirm.status}`
        );
    }

    async claim(
        app: App,
        authority: Keypair,
        communities?: AppCommunity[]
    ): Promise<void> {
        const commKeys: string[] = [];
        if (communities) {
            for (const comm of communities) {
                commKeys.push(comm.key.publicKey.toBase58());
            }
        }

        const prep = await this.post(`staking/v1/claim/prepare`, {
            fund: true,
            authority: authority.publicKey.toBase58(),
            withdraw: commKeys
        });

        const data = Buffer.from(prep.message, 'base64');
        const userSig = nacl.sign.detached(data, authority.secretKey);

        const result = await this.post(`staking/v1/claim`, {
            message: prep.message,
            userSignature: Buffer.from(userSig).toString('base64')
        });

        const confirm = await this.get(
            `general/v1/confirm/${result.txSignature}?stakingExtract=true`
        );
        console.log(
            `Claimed harvest for authority ${authority.publicKey.toBase58()}: ${
                result.txSignature
            }\n\t${confirm.status}, ${confirm.claimed} ZEE`
        );
    }
    async stake(
        app: App,
        community: AppCommunity,
        staker: AppStaker,
        amount: bigint
    ): Promise<void> {
        const prep = await this.post(
            `staking/v1/stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake/prepare`,
            {
                fund: true,
                amount: Number(amount)
            }
        );
        console.log(
            `Stake prep: \n\trecent: ${prep.recent}\n\tmessage: ${prep.message}\n\tinitialize: ${prep.initialize}`
        );

        const userSig = nacl.sign.detached(
            Buffer.from(prep.message, 'base64'),
            staker.key.secretKey
        );

        const result = await this.post(
            `staking/v1/stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/stake`,
            {
                userSignature: Buffer.from(userSig).toString('base64'),
                message: prep.message
            }
        );

        const confirm = await this.get(
            `general/v1/confirm/${result.txSignature}?stakingExtract=true`
        );
        console.log(
            `Stake result: ${result.txSignature}\n\t${confirm.status}, ${confirm.claimed} ZEE`
        );
    }

    async withdraw(
        app: App,
        staker: AppStaker,
        communities: AppCommunity[]
    ): Promise<void> {
        for (const community of communities) {
            const prep = await this.post(
                `staking/v1/stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/withdraw/prepare`,
                {
                    fund: true
                }
            );

            const userSig = nacl.sign.detached(
                Buffer.from(prep.message, 'base64'),
                staker.key.secretKey
            );

            const result = await this.post(
                `staking/v1/stake/${community.key.publicKey.toBase58()}/${staker.key.publicKey.toBase58()}/withdraw`,
                {
                    userSignature: Buffer.from(userSig).toString('base64'),
                    message: prep.message
                }
            );

            const confirm = await this.get(
                `general/v1/confirm/${result.txSignature}`
            );
            console.log(
                `Withdraw result: ${result.txSignature}, ${confirm.status}`
            );
        }
    }
}
*/
