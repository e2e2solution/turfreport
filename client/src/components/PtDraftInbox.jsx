import { useCallback, useEffect, useState } from 'react';
import {
  collectPtDrafts,
  confirmPtDraft,
  fetchPtDrafts,
  formatCurrency,
  formatDateDMY,
  publishPtClientsToCloud,
  rejectPtDraft,
  syncPtTrainersToCloud,
  syncReadyPtDrafts,
} from '../api';
import { ptGoalLabel, ptPlanLabel, ptStatusLabel } from '../utils/pt';

export default function PtDraftInbox({ onConfirmed }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncingReady, setSyncingReady] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchPtDrafts()
      .then(setDrafts)
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, []);

  const autoSyncReady = useCallback(async (silent = false) => {
    setSyncingReady(true);
    try {
      const result = await syncReadyPtDrafts();
      if (result.auto_applied > 0) {
        if (!silent) {
          alert(`${result.auto_applied} completed client(s) moved to Ready for Payment: ${result.auto_applied_clients.join(', ')}`);
        }
        onConfirmed?.();
        load();
      }
      return result;
    } catch (err) {
      if (!silent) alert(err.message);
      return null;
    } finally {
      setSyncingReady(false);
    }
  }, [load, onConfirmed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    syncReadyPtDrafts()
      .then((result) => {
        if (result?.auto_applied > 0) {
          onConfirmed?.();
          load();
        }
      })
      .catch(() => {});
    // Auto-sync completed drafts once when inbox opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCollect = async () => {
    setLoading(true);
    try {
      const result = await collectPtDrafts();
      setDrafts(result.drafts || []);
      const autoMsg = result.auto_applied
        ? `\n${result.auto_applied} completed → Ready for Payment (no approval needed)`
        : '';
      alert(`Collected ${result.count || 0} draft(s) needing approval${autoMsg}`);
      if (result.auto_applied > 0) onConfirmed?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncTrainers = async () => {
    setSyncing(true);
    try {
      const result = await syncPtTrainersToCloud();
      alert(`Synced ${result.synced} of ${result.total} trainer(s) to cloud`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handlePublishClients = async () => {
    setPublishing(true);
    try {
      const result = await publishPtClientsToCloud();
      alert(`Published ${result.published} client(s) to trainers (${result.skipped} pending changes kept)`);
    } catch (err) {
      alert(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleConfirm = async (draft) => {
    const action = draft.is_update
      ? `Apply ${draft.client_name}'s session updates to local PT?`
      : `Add ${draft.client_name} to local PT (${draft.trainer_name})?`;
    if (!confirm(action)) return;
    setActingId(draft.draft_id);
    try {
      await confirmPtDraft(draft.draft_id);
      setDrafts((rows) => rows.filter((d) => d.draft_id !== draft.draft_id));
      onConfirmed?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (draft) => {
    const reason = prompt(`Reject ${draft.client_name}? Optional reason:`) ?? '';
    if (reason === null) return;
    setActingId(draft.draft_id);
    try {
      await rejectPtDraft(draft.draft_id, reason);
      setDrafts((rows) => rows.filter((d) => d.draft_id !== draft.draft_id));
    } catch (err) {
      alert(err.message);
    } finally {
      setActingId(null);
    }
  };

  const completedDrafts = drafts.filter((d) => d.is_auto_ready);
  const reviewDrafts = drafts.filter((d) => d.needs_approval);

  const renderDraftCard = (draft, { showActions = true } = {}) => (
    <div key={draft.draft_id} className="booking-card">
      <div className="card-top">
        <strong>{draft.client_name}</strong>
        <span className={`badge ${draft.is_auto_ready ? 'closed' : draft.is_update ? 'pending' : 'closed'}`}>
          {draft.is_auto_ready ? 'Trainer completed' : draft.is_update ? 'Session update' : 'New client'}
        </span>
      </div>
      <div className="card-meta">
        <span>Status: {ptStatusLabel(draft.pt_status)}</span>
        {draft.is_auto_ready && <span>No approval needed</span>}
      </div>
      <div className="card-meta">
        <span>Trainer: {draft.trainer_name}</span>
        <span>{ptPlanLabel(draft.plan_type)}</span>
        <span>{ptGoalLabel(draft.pt_goal)}</span>
      </div>
      <div className="card-meta">
        <span>Start {formatDateDMY(draft.start_date)}</span>
        <span>
          Sessions {draft.sessions?.length || 0}
          {draft.plan_type && ` / ${draft.session_target ?? '—'}`}
        </span>
        <span>Due {formatCurrency(draft.amount_due)}</span>
      </div>
      {showActions && (
        <div className="card-actions">
          {draft.is_auto_ready ? (
            <button
              type="button"
              className="btn small primary"
              disabled={syncingReady}
              onClick={() => autoSyncReady(false)}
            >
              {syncingReady ? '...' : 'Sync to Ready for Payment'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn small primary"
                disabled={actingId === draft.draft_id}
                onClick={() => handleConfirm(draft)}
              >
                {actingId === draft.draft_id ? '...' : (draft.is_update ? 'Approve update' : 'Confirm')}
              </button>
              <button
                type="button"
                className="btn small danger"
                disabled={actingId === draft.draft_id}
                onClick={() => handleReject(draft)}
              >
                Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="card pt-draft-inbox">
      <div className="card-title-row">
        <h3>Trainer drafts &amp; updates</h3>
        <div className="pt-draft-inbox-actions">
          <button type="button" className="btn small" onClick={handleSyncTrainers} disabled={syncing}>
            {syncing ? '...' : 'Sync trainers'}
          </button>
          <button type="button" className="btn small" onClick={handlePublishClients} disabled={publishing}>
            {publishing ? '...' : 'Publish clients'}
          </button>
          <button type="button" className="btn small" onClick={() => autoSyncReady(false)} disabled={syncingReady}>
            {syncingReady ? '...' : 'Sync completed'}
          </button>
          <button type="button" className="btn small primary" onClick={handleCollect} disabled={loading}>
            Collect drafts
          </button>
        </div>
      </div>
      <p className="hint">
        <strong>Trainer completed</strong> clients go straight to Ready for Payment (no approval).
        Session updates and new clients still need <strong>Confirm</strong>.
      </p>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          {completedDrafts.length > 0 && (
            <div className="pt-draft-section">
              <h4>Trainer completed — auto sync</h4>
              <div className="booking-list">
                {completedDrafts.map((draft) => renderDraftCard(draft))}
              </div>
            </div>
          )}

          {reviewDrafts.length > 0 ? (
            <div className="pt-draft-section">
              <h4>Needs your approval</h4>
              <div className="booking-list">
                {reviewDrafts.map((draft) => renderDraftCard(draft))}
              </div>
            </div>
          ) : !completedDrafts.length ? (
            <p className="muted">No pending trainer drafts.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
