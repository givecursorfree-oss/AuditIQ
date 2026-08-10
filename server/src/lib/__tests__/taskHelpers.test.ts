import { describe, expect, it } from 'vitest';
import {
  displayTaskStatus,
  enrichTask,
  isTaskOverdue,
  normalizeTaskStatus,
} from '../taskHelpers.js';

describe('taskHelpers', () => {
  it('maps legacy statuses to normalized values', () => {
    expect(normalizeTaskStatus('Open')).toBe('not_started');
    expect(normalizeTaskStatus('In Progress')).toBe('in_progress');
    expect(normalizeTaskStatus('Done')).toBe('completed');
    expect(normalizeTaskStatus('blocked')).toBe('blocked');
  });

  it('marks overdue when due date is in the past and not completed', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isTaskOverdue({ dueDate: yesterday, status: 'not_started' })).toBe(true);
    expect(displayTaskStatus({ dueDate: yesterday, status: 'not_started' })).toBe('overdue');
  });

  it('does not mark completed tasks as overdue', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isTaskOverdue({ dueDate: yesterday, status: 'completed' })).toBe(false);
  });

  it('enriches task with displayStatus and isOverdue', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const enriched = enrichTask({
      id: 't1',
      title: 'Test',
      status: 'Open',
      dueDate: tomorrow,
    } as Parameters<typeof enrichTask>[0]);
    expect(enriched.status).toBe('not_started');
    expect(enriched.isOverdue).toBe(false);
    expect(enriched.displayStatus).toBe('not_started');
  });
});
