import { describe, it, expect, vi } from 'vitest';
import type { MatrixClient } from 'matrix-bot-sdk';
import { onRoomEvent, onRoomMessage } from './index.js';

function createMockClient() {
  return {
    sendText: vi.fn(async () => {}),
    sendHtmlText: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    getUserId: vi.fn(async () => '@bot:server')
  } as unknown as MatrixClient;
}

describe('handlers', () => {
  it('warns when receiving encrypted event', async () => {
    const c = createMockClient();
    await onRoomEvent(c, '!room', { type: 'm.room.encrypted', sender: '@u:sv', event_id: '$x' });
    expect((c as any).sendText).toHaveBeenCalled();
  });

  it('ignores non-text messages', async () => {
    const c = createMockClient();
    await onRoomMessage(c, '!room', { content: { msgtype: 'm.image' }, sender: '@u:sv' });
    expect((c as any).sendText).not.toHaveBeenCalled();
    expect((c as any).sendHtmlText).not.toHaveBeenCalled();
  });
});



