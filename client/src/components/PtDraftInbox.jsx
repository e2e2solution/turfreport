import { useEffect, useState } from 'react';
import {
  collectPtDrafts,
  confirmPtDraft,
  fetchPtDrafts,
  formatCurrency,
  formatDateDMY,
  rejectPtDraft,
  syncPtTrainersToCloud,
} from '../api';
import { ptGoalLabel, ptPlanLabel, ptStatusLabel } from '../utils/pt';

export default function PtDraftInbox({ onConfirmed }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [syncing, setSyncing] = useState(false);

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

  const handleConfirm = async (draft) => {
    if (!confirm(`Add ${draft.client_name} to local PT (${draft.trainer_name})?`)) return;
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
        <h3>Trainer drafts (MongoDB)</h3>
        <div className="pt-draft-inbox-actions">
          <button type="button" className="btn small" onClick={handleSyncTrainers} disabled={syncing}>
            {syncing ? '...' : 'Sync trainers'}
          </button>
          <button type="button" className="btn small primary" onClick={handleCollect} disabled={loading}>
            Collect drafts
          </button>
        </div>
      </div>
      <p className="hint">
        Trainers save clients on the trainer app. Collect drafts here, then confirm each client to add to local DB.
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
                <span className="badge pending">{ptStatusLabel(draft.pt_status)}</span>
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
                  {actingId === draft.draft_id ? '...' : 'Confirm'}
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
