export async function cleanupSidebarSection(sectionId, archivedThreadKeys, { list, remove, wait }) {
  if (typeof sectionId !== 'string' || !sectionId || ['pinned', 'chats', 'threads', 'projects'].includes(sectionId)) {
    throw new Error('The custom section ID from this run’s creation receipt is required');
  }
  const archived = new Set(archivedThreadKeys);
  const receipt = { sectionId, status: 'pending', checks: [] };
  const delays = [0, 2000, 5000, 10000];

  async function check(phase) {
    const snapshot = await list();
    if (!Array.isArray(snapshot?.sections) || snapshot.unavailableHosts?.length || snapshot.unavailableSources?.length) {
      throw new Error('The sidebar snapshot is unavailable or incomplete');
    }
    const section = snapshot.sections.find(section => section.sectionId === sectionId);
    const members = section ? section.itemKeys : null;
    if (section && !Array.isArray(members)) throw new Error('Section membership is unavailable');
    receipt.checks.push({ phase, members });
    return members;
  }

  try {
    for (const delay of delays) {
      if (delay) await wait(delay);
      const members = await check('before_delete');
      if (members === null) return { ...receipt, status: 'absent' };
      if (!members.length) {
        receipt.delete_receipt = await remove(sectionId);
        if (receipt.delete_receipt?.sectionId !== sectionId || receipt.delete_receipt.deleted !== true) {
          return { ...receipt, reason: 'delete_not_confirmed' };
        }
        for (const delay of delays) {
          if (delay) await wait(delay);
          if (await check('after_delete') === null) return { ...receipt, status: 'deleted' };
        }
        return { ...receipt, reason: 'deletion_not_visible' };
      }
      if (members.some(key => !archived.has(key))) {
        return { ...receipt, status: 'retained', reason: 'other_or_unarchived_members' };
      }
    }
    return { ...receipt, reason: 'archived_members_still_visible' };
  } catch (error) {
    return { ...receipt, reason: 'tool_error', error: String(error?.message || error) };
  }
}
