import { RequestError, ContractError, GaslessOptions } from '@avnu/gasless-sdk';
import CryptoJs from 'crypto-js';
import { cairo, Call, CallData, ec, hash, RawArgs, Uint256 } from 'starknet';

export function decryptPin(encryptedPin: any, secret: any) {
    const bytes = CryptoJs.AES.decrypt(encryptedPin, secret);
    return bytes.toString(CryptoJs.enc.Utf8);
}

export function encryptSecretWithPin(pin: any, secretHex: string) {
    const cleanHex = secretHex.startsWith("0x") ? secretHex.slice(2) : secretHex;
    const encrypted = CryptoJs.AES.encrypt(cleanHex, pin).toString();
    return encrypted;
}

export function decryptSecretWithPin(encryptedSecret: any, pin: any) {
    const decrypted = CryptoJs.AES.decrypt(encryptedSecret, pin);
    const hex = decrypted.toString(CryptoJs.enc.Utf8);
    return "0x" + hex;
}

export function formatAmount(amount: string | number, decimals: number = 18): Uint256 {
    const amountStr = amount.toString();
    const [integerPart, decimalPart = ''] = amountStr.split('.');
    const paddedDecimal = decimalPart.padEnd(decimals, '0').slice(0, decimals);
    const amountBN = BigInt(integerPart + paddedDecimal);

    return cairo.uint256(amountBN);
}

export const parseResponse = <T>(response: Response, apiPublicKey?: string): Promise<T> => {
    if (response.status === 400) {
        return response.json().then((error: RequestError) => {
            throw new Error(error.messages[0]);
        });
    }
    if (response.status === 500) {
        return response.json().then((error: RequestError) => {
            if (error.messages.length >= 0 && error.messages[0].includes('Contract error')) {
                throw new ContractError(error.messages[0], error.revertError || '');
            } else {
                throw new Error(error.messages[0]);
            }
        });
    }
    if (response.status > 400) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    if (apiPublicKey) {
        const signature = response.headers.get('signature');
        if (!signature) throw new Error('No server signature');
        return response
            .clone()
            .text()
            .then((textResponse) => {
                const hashResponse = hash.computeHashOnElements([hash.starknetKeccak(textResponse)]);
                const formattedSig = signature.split(',').map((s) => BigInt(s));
                const signatureType = new ec.starkCurve.Signature(formattedSig[0], formattedSig[1]);
                if (!ec.starkCurve.verify(signatureType, hashResponse, apiPublicKey))
                    throw new Error('Invalid server signature');
            })
            .then(() => response.json());
    }
    return response.json();
};

export const postRequest = (body: unknown, options?: GaslessOptions): RequestInit => ({
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options?.apiKey && { 'api-key': options.apiKey }),
      ...(options?.apiPublicKey && { 'ask-signature': 'true' }),
      ...options?.customHeaders,
    },
    body: JSON.stringify(body),
  });