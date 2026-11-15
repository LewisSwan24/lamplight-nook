/** Card colours for projects (road-to-1.2.md B2), light enough to read pinned on the dark blackboard. B9 uses them too. */
export const PROJECT_COLORS = ['#e9b872', '#9cc7b8', '#e59a8c', '#b7a6d9', '#f2d98d', '#a9c6e8'] as const;

/**
 * A project's colour, from where it stands among all the projects (ProjectRow.color): the same every time, since projects
 * are only ever added, and the first six all differ.
 */
export const projectColor = (n: number): string => PROJECT_COLORS[n % PROJECT_COLORS.length];
