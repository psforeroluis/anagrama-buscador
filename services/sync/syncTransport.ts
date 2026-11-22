// Comunicación con /api/sync. El motor solo conoce esta interfaz, así que se puede
// probar con un servidor simulado y cambiar de proveedor tocando únicamente este archivo.

import type { RemoteGames } from './syncMerge';

export interface SyncDoc {
    schemaVersion: 1;
    games: RemoteGames;
}

export type PullResult =
    | { status: 'empty' }
    | { status: 'ok'; doc: SyncDoc; etag: string };

export type PushResult =
    | { status: 'ok'; etag: string }
    | { status: 'conflict' };

export interface SyncTransport {
    pull(): Promise<PullResult>;
    /** `etag` es el de la última lectura; sin él, el servidor solo crea si no existe. */
    push(doc: SyncDoc, etag?: string): Promise<PushResult>;
}

export type SyncErrorKind = 'unauthorized' | 'offline' | 'too-large' | 'schema' | 'invalid' | 'server' | 'backup' | 'conflicts';

export class SyncError extends Error {
    constructor(public kind: SyncErrorKind, message?: string) {
        super(message ?? kind);
    }
}

export const httpTransport = (token: string, endpoint = '/api/sync'): SyncTransport => {
    const request = async (init: RequestInit): Promise<Response> => {
        try {
            return await fetch(endpoint, {
                ...init,
                headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
        } catch {
            throw new SyncError('offline');
        }
    };
    const fail = async (res: Response): Promise<never> => {
        if (res.status === 401) throw new SyncError('unauthorized');
        if (res.status === 413) throw new SyncError('too-large');
        if (res.status === 400) {
            const body = await res.json().catch(() => ({}));
            throw new SyncError(body?.error === 'schema' ? 'schema' : 'invalid');
        }
        throw new SyncError('server', `HTTP ${res.status}`);
    };

    return {
        async pull() {
            const res = await request({ method: 'GET' });
            if (res.status === 404) return { status: 'empty' };
            if (!res.ok) return fail(res);
            const doc = await res.json().catch(() => null);
            const etag = res.headers.get('ETag');
            if (!doc || !etag || typeof doc.games !== 'object') throw new SyncError('server', 'respuesta no válida');
            return { status: 'ok', doc, etag };
        },
        async push(doc, etag) {
            const res = await request({
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
                body: JSON.stringify(doc),
            });
            if (res.status === 412) return { status: 'conflict' };
            if (!res.ok) return fail(res);
            const next = res.headers.get('ETag');
            if (!next) throw new SyncError('server', 'sin ETag');
            return { status: 'ok', etag: next };
        },
    };
};
