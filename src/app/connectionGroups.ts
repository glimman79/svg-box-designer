import type { BoxProjectData } from './projectState';

export const constructionGroupField = { TB: 'activeTBGroup', W: 'activeWallGroup', S: 'activeSGroup' } as const;
export type GroupTool = keyof typeof constructionGroupField;

export function connectionGroups(box: BoxProjectData, tool: GroupTool) {
  const completed = tool === 'TB' ? box.completedTBGroups : tool === 'W' ? box.completedWallGroups : box.completedSGroups ?? [];
  const current = box[constructionGroupField[tool]];
  return current ? [...completed.filter(group => group.groupId !== current.groupId), current] : completed;
}
