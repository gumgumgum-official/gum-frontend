우리 프로젝트의 전시 환경 최적화를 검증하고 싶다.

현재 상황:

- React 기반
- Three.js 또는 React Three Fiber 사용 가능성 있음
- GLB 모델과 이미지가 많음
- GLB 내부에 animation 포함
- 전시장 네트워크 혼잡 환경에서 느려짐
- 초기 로딩 이후에는 네트워크 요청이 최소화되어야 함

검증 목표:

1. GLB 파일이 최초 1회만 fetch되는지
2. 페이지 이동/상태 변경 시 다시 다운로드되는지
3. animation 실행 시 추가 네트워크 요청이 발생하는지
4. texture가 별도 fetch되는 구조인지
5. 브라우저 캐시만 사용하는지, 메모리 캐시도 유지되는지
6. React rerender 때문에 GLB가 다시 로드되는 부분이 있는지
7. useGLTF/useLoader가 캐시를 제대로 활용하는지
8. preload 코드가 실제 적용되는지
9. Suspense fallback 때문에 중복 로딩이 생기지 않는지
10. 전시장 환경에서 가장 위험한 재요청 패턴이 무엇인지

다음 항목을 중심으로 분석해줘:

- GLB 로딩 구조
- preload 여부
- cache 여부
- animation 처리 구조
- rerender 시 재fetch 가능성
- texture loading 구조
- network waterfall 기준 위험 요소
- Safari/iPad 환경 위험성

그리고:

- 실제로 fetch가 재발생하는지 확인하는 방법
- Chrome DevTools Network 탭에서 어떻게 검증하는지
- Disable cache ON/OFF 상태에서 어떻게 테스트해야 하는지
- throttling으로 전시장 환경 시뮬레이션하는 방법
- preload/useGLTF.preload 적용 위치
- 가장 위험한 anti-pattern

까지 매우 구체적으로 설명해줘.
