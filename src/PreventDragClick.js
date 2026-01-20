// ----- 드래그 클릭 방지
/*사용자가 마우스를 드래그한 후 떼었을 때, 단순히 클릭으로 오인되어 의도치 않은 Raycaster 동작이 발생하는 문제를 해결*/

export class PreventDragClick {
  constructor(elem) {
    this.mouseMoved; // 마우스를 드래그 했는지 true/false
    let clickStartX;
    let clickStartY;
    let clickStartTime;
    elem.addEventListener("mousedown", (e) => {
      clickStartX = e.clientX;
      clickStartY = e.clientY;
      clickStartTime = Date.now();
    });
    elem.addEventListener("mouseup", (e) => {
      const xGap = Math.abs(e.clientX - clickStartX);
      const yGap = Math.abs(e.clientY - clickStartY);
      const timeGap = Date.now() - clickStartTime;

      if (xGap > 5 || yGap > 5 || timeGap > 500) {
        this.mouseMoved = true;
      } else {
        this.mouseMoved = false;
      }
    });
  }
}
