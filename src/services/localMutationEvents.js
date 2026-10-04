export const LOCAL_MUTATION_EVENT = "streaks:local-mutation";
const mutationChannelName = "streaks-local-mutations";
let mutationChannel;

export function publishLocalMutation() {
  const browserWindow = globalThis.window;
  if (typeof browserWindow?.dispatchEvent === "function") {
    browserWindow.dispatchEvent(new Event(LOCAL_MUTATION_EVENT));
  }
  if (typeof BroadcastChannel !== "undefined" && typeof browserWindow?.addEventListener === "function") {
    mutationChannel ||= new BroadcastChannel(mutationChannelName);
    mutationChannel.postMessage({ type: "local-mutation", at: Date.now() });
  }
}

export function subscribeLocalMutations(callback) {
  const browserWindow = globalThis.window;
  if (typeof browserWindow?.addEventListener !== "function") return () => {};
  const handleWindowEvent = () => callback();
  browserWindow.addEventListener(LOCAL_MUTATION_EVENT, handleWindowEvent);

  let channel;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(mutationChannelName);
    channel.addEventListener("message", (event) => {
      if (event.data?.type === "local-mutation") callback();
    });
  }

  return () => {
    browserWindow.removeEventListener(LOCAL_MUTATION_EVENT, handleWindowEvent);
    channel?.close();
  };
}

export function debounceTask(callback, delayMs) {
  let timer = null;
  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(callback, delayMs);
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
    }
  };
}
