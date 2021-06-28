import { Keypair } from '@solana/web3.js';
import { createHash } from 'crypto';

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function seededKey(name: string, seed: Buffer): Keypair {
    const hash = createHash('sha256').update(name).update(seed).digest();
    return Keypair.fromSeed(hash);
}
