import { teleportStyle } from '@util/script';
import './style.scss';
import { renderAllMessages, renderMessage } from './render';

$(() => {
  $(`head > div[script_id="${getScriptId()}"]`).remove();
  const { destroy } = teleportStyle();
  const listeners = [
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.USER_MESSAGE_RENDERED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.MESSAGE_UPDATED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.MESSAGE_SWIPED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.GENERATION_ENDED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.CHAT_CHANGED, () => {
      void renderAllMessages();
    }),
  ];

  void renderAllMessages();

  $(window).on('pagehide', () => {
    for (const listener of listeners) listener.stop();
    destroy();
  });
});
