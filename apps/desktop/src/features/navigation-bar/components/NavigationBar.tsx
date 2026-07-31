function NavigationBar() {
  return (
    <aside className="navigation-bar">
      <div className="navigation-header">
        <div className="navigation-title">Navigation Bar</div>
        <button className="navigation-add-button" type="button">
          +
        </button>
      </div>

      <div className="navigation-search">
        <input type="text" placeholder="폴더 또는 Task 검색" />
      </div>

      <div className="navigation-tree">
        <div className="tree-node folder">최상위 폴더</div>
        <div className="tree-node folder child-1">중간폴더 1</div>
        <div className="tree-node folder child-2">중간폴더 2</div>
        <div className="tree-node task child-3 is-selected">
          Task: 명명식 준비 체크리스트
        </div>
        <div className="tree-node task child-3">Task: 참석자 준비 체크리스트</div>
      </div>
    </aside>
  )
}

export default NavigationBar
