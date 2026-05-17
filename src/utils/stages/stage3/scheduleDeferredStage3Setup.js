/**
 * Stage3 onReady 내 비필수 작업을 메인 스레드 유휴 시점으로 지연
 * @returns {{ schedule: (task: () => void) => void, cancel: () => void }}
 */
export function createDeferredStage3SetupScheduler() {
  /** @type {any} */
  let taskId = null;
  /** @type {"idle" | "timeout" | null} */
  let taskKind = null;

  function cancel() {
    if (
      taskKind === "idle" &&
      taskId != null &&
      "cancelIdleCallback" in globalThis
    ) {
      globalThis.cancelIdleCallback(taskId);
    } else if (taskKind === "timeout" && taskId != null) {
      globalThis.clearTimeout(taskId);
    }
    taskId = null;
    taskKind = null;
  }

  /** @param {() => void} task */
  function schedule(task) {
    cancel();
    if ("requestIdleCallback" in globalThis) {
      taskKind = "idle";
      taskId = globalThis.requestIdleCallback(() => {
        taskId = null;
        taskKind = null;
        task();
      });
      return;
    }
    taskKind = "timeout";
    taskId = globalThis.setTimeout(() => {
      taskId = null;
      taskKind = null;
      task();
    }, 0);
  }

  return { schedule, cancel };
}
