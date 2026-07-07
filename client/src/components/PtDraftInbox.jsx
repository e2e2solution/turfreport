import { useEffect, useState } from 'react';
import {
  collectPtDrafts,
  confirmPtDraft,
  fetchPtDrafts,
  formatCurrency,
  formatDateDMY,
  publishPtClientsToCloud,
  rejectPtDraft,
  syncPtTrainersToCloud,
} from '../api';
import { ptGoalLabel, ptPlanLabel, ptStatusLabel } from '../utils/pt';

export default function PtDraftInbox({ onConfirmed }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = () => {
    setLoading(true);
    fetchPtDrafts()
      .then(setDrafts)
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCollect = async () => {
    setLoading(true);
    try {
      const result = await collectPtDrafts();
      setDrafts(result.drafts || []);
      alert(`Collected ${result.count || 0} draft(s) from ${result.source || 'cloud'}`);
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
          <button type="button" className="btn small primary" onClick={handleCollect} disabled={loading}>
            Collect drafts
          </button>
        </div>
      </div>
      <p className="hint">
        <strong>Publish clients</strong> sends dashboard clients to trainers. Trainers add clients and mark
        sessions on their app; <strong>Collect drafts</strong> pulls new clients and session updates here, then
        confirm each to reflect in the local DB.
      </p>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : !drafts.length ? (
        <p className="muted">No pending trainer drafts.</p>
      ) : (
        <div className="booking-list">
          {drafts.map((draft) => (
            <div key={draft.draft_id} className="booking-card">
              <div className="card-top">
                <strong>{draft.client_name}</strong>
                <span className={`badge ${draft.is_update ? 'pending' : 'closed'}`}>
                  {draft.is_update ? 'Session update' : 'New client'}
                </span>
              </div>
              <div className="card-meta">
                <span>Status: {ptStatusLabel(draft.pt_status)}</span>
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
                <span>Due {formatCurrency((draft.total_amount || 0) - ((draft.advance_gpay || 0) + (draft.advance_cash || 0) + (draft.balance_gpay || 0) + (draft.balance_cash || 0)))}</span>
              </div>
              <div className="card-actions">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
