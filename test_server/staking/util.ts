import { Keypair } from '@solana/web3.js';
import { createHmac } from 'crypto';

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function seededKey(name: string, seed: Buffer): Keypair {
    const hash = createHmac('sha256', seed).update(name).digest();
    return Keypair.fromSeed(hash);
}
