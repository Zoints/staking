import { Keypair, PublicKey } from '@solana/web3.js';
import { App } from './app';
import { StakeEngine } from './engine';
import axios, { AxiosInstance } from 'axios';
import nacl from 'tweetnacl';
import { Authority } from '@zoints/staking';

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

    async registerEndpoint(
        app: App,
        key: Keypair,
        owner: Authority,
        primary: PublicKey,
        secondary: PublicKey
    ): Promise<void> {
        const result = await this.post('staking/v1/endpoint/register', {
            authorityType: owner.authorityType,
            authorityAddress: owner.address.toBase58(),
            primary: primary.toBase58(),
            secondary: secondary.toBase58(),
            seed: Buffer.from(key.secretKey).toString('hex')
        });

        const confirm = await this.get(
            `general/v1/confirm/${result.txSignature}`
        );

        console.log(
            `Endpoint create:\n\tsig: ${result.txSignature}\n\tendpoint: ${result.endpoint}\n\tconfirm: ${confirm.status}`
        );
    }

    async claim(
        app: App,
        authority: Keypair,
        endpoints?: PublicKey[]
    ): Promise<void> {
        const epKeys: string[] = [];
        if (endpoints) {
            for (const ep of endpoints) {
                epKeys.push(ep.toBase58());
            }
        }

        const prep = await this.post(`staking/v1/claim/prepare`, {
            fund: true,
            authority: authority.publicKey.toBase58(),
            withdraw: epKeys
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
        endpoint: PublicKey,
        staker: Keypair,
        amount: bigint
    ): Promise<void> {
        const prep = await this.post(
            `staking/v1/stake/${endpoint.toBase58()}/${staker.publicKey.toBase58()}/stake/prepare`,
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
            staker.secretKey
        );

        const result = await this.post(
            `staking/v1/stake/${endpoint.toBase58()}/${staker.publicKey.toBase58()}/stake`,
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
        staker: Keypair,
        endpoints: PublicKey[]
    ): Promise<void> {
        for (const endpoint of endpoints) {
            const prep = await this.post(
                `staking/v1/stake/${endpoint.toBase58()}/${staker.publicKey.toBase58()}/withdraw/prepare`,
                {
                    fund: true
                }
            );

            const userSig = nacl.sign.detached(
                Buffer.from(prep.message, 'base64'),
                staker.secretKey
            );

            const result = await this.post(
                `staking/v1/stake/${endpoint.toBase58()}/${staker.publicKey.toBase58()}/withdraw`,
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

    async transfer(
        app: App,
        endpoint: PublicKey,
        owner: PublicKey,
        ownerSigner: Keypair,
        recipient: Authority
    ): Promise<void> {
        const prep = await this.post(
            `staking/v1/endpoint/transfer/${endpoint.toBase58()}/prepare`,
            {
                fund: true,
                recipientType: recipient.authorityType,
                recipient: recipient.address.toBase58()
            }
        );
        console.log(
            `Transfer prep: \n\trecent: ${prep.recent}\n\tmessage: ${prep.message}`
        );

        const userSig = nacl.sign.detached(
            Buffer.from(prep.message, 'base64'),
            ownerSigner.secretKey
        );

        const result = await this.post(
            `staking/v1/endpoint/transfer/${endpoint.toBase58()}`,
            {
                userSignature: Buffer.from(userSig).toString('base64'),
                message: prep.message
            }
        );

        const confirm = await this.get(
            `general/v1/confirm/${result.txSignature}`
        );
        console.log(
            `Transfer result: ${result.txSignature}\n\t${confirm.status}`
        );
    }
    async changeBeneficiaries(
        app: App,
        endpoint: PublicKey,
        owner: PublicKey,
        ownerSigner: Keypair,
        oldPrimary: PublicKey,
        oldSecondary: PublicKey,
        newPrimary: PublicKey,
        newSecondary: PublicKey
    ): Promise<void> {
        const prep = await this.post(
            `staking/v1/endpoint/change-beneficiaries/${endpoint.toBase58()}/prepare`,
            {
                fund: true,
                newPrimary,
                newSecondary
            }
        );
        console.log(
            `Change beneficiaries prep: \n\trecent: ${prep.recent}\n\tmessage: ${prep.message}`
        );

        const userSig = nacl.sign.detached(
            Buffer.from(prep.message, 'base64'),
            ownerSigner.secretKey
        );

        const result = await this.post(
            `staking/v1/endpoint/change-beneficiaries/${endpoint.toBase58()}`,
            {
                userSignature: Buffer.from(userSig).toString('base64'),
                message: prep.message
            }
        );

        const confirm = await this.get(
            `general/v1/confirm/${result.txSignature}`
        );
        console.log(
            `Change beneficiaries result: ${result.txSignature}\n\t${confirm.status}`
        );
    }
}
