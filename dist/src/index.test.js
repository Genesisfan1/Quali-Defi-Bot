import { describe, it, expect, vi } from 'vitest';
import { onRoomEvent, onRoomMessage } from './index.js';
function createMockClient() {
    return {
        sendText: vi.fn(async () => { }),
        sendHtmlText: vi.fn(async () => { }),
        sendMessage: vi.fn(async () => { }),
        getUserId: vi.fn(async () => '@bot:server')
    };
}
describe('handlers', () => {
    it('warns when receiving encrypted event', async () => {
        const c = createMockClient();
        await onRoomEvent(c, '!room', { type: 'm.room.encrypted', sender: '@u:sv', event_id: '$x' });
        expect(c.sendText).toHaveBeenCalled();
    });
    it('ignores non-text messages', async () => {
        const c = createMockClient();
        await onRoomMessage(c, '!room', { content: { msgtype: 'm.image' }, sender: '@u:sv' });
        expect(c.sendText).not.toHaveBeenCalled();
        expect(c.sendHtmlText).not.toHaveBeenCalled();
    });
});
