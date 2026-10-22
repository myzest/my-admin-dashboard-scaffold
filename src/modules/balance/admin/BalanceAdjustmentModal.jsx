import { useId, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Space } from '@arco-design/web-react';
import { useSWRConfig } from 'swr';
import { v4 as createOperationId } from 'uuid';
import { useAuthRequest } from '@/modules/auth/client';
import RequestError from '@/components/RequestError';
import useFormErrors from '@/components/useFormErrors';
import { balanceChangeSchema } from '@/modules/users/client';
import { createFieldRules } from '@/lib/validation';
import styles from '@/styles/workspace.module.css';
import {
  createPendingBalanceAdjustment,
  deletePendingBalanceAdjustment,
  getPendingBalanceAdjustment,
} from '../balance-adjustment-storage';

function getStoredAdjustment(operatorId, userId) {
  try {
    return { pending: getPendingBalanceAdjustment(operatorId, userId), error: null };
  } catch (error) {
    return { pending: null, error };
  }
}

export default function BalanceAdjustmentModal({ operatorId, user, onCancel, onSuccess }) {
  const formId = useId();
  const [storedAdjustment, setStoredAdjustment] = useState(() =>
    getStoredAdjustment(operatorId, user.id),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const form = useFormErrors(error);
  const request = useAuthRequest();
  const { mutate } = useSWRConfig();
  const pendingAdjustment = storedAdjustment.pending;

  function clearPendingAdjustment() {
    deletePendingBalanceAdjustment(operatorId, user.id);
    setStoredAdjustment({ pending: null, error: null });
  }

  async function adjustBalance(values) {
    if (isSubmitting || storedAdjustment.error) return;
    const adjustment = pendingAdjustment || {
      operationId: createOperationId(),
      payload: { ...values, amount: values.amount.trim(), reason: values.reason.trim() },
    };
    setError(null);
    try {
      if (!pendingAdjustment) {
        createPendingBalanceAdjustment(operatorId, user.id, adjustment);
        setStoredAdjustment({ pending: adjustment, error: null });
      }
    } catch (storageError) {
      setError(storageError);
      return;
    }

    setIsSubmitting(true);
    try {
      try {
        await request(`/api/admin/users/${user.id}/balance`, {
          method: 'POST',
          body: { ...adjustment.payload, operationId: adjustment.operationId },
        });
      } catch (requestError) {
        setError(requestError);
        if (
          [
            'VALIDATION_ERROR',
            'INVALID_AMOUNT',
            'INSUFFICIENT_BALANCE',
            'BALANCE_LIMIT_EXCEEDED',
          ].includes(requestError.code)
        ) {
          try {
            clearPendingAdjustment();
          } catch (storageError) {
            setError(storageError);
          }
        }
        return;
      }
      try {
        clearPendingAdjustment();
      } catch (storageError) {
        setError(storageError);
        return;
      }
      await mutate(
        (key) => typeof key === 'string' && key.startsWith('/api/admin/balance-logs'),
        undefined,
        { revalidate: false, throwOnError: false },
      );
      await onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      visible
      title="调整余额"
      footer={null}
      onCancel={onCancel}
      maskClosable={false}
      closable={!isSubmitting}
      escToExit={!isSubmitting}
      style={{ width: 'min(480px, calc(100vw - 32px))' }}
    >
      <p className={styles.description}>
        {user.username} · 当前余额 {user.balance}
      </p>
      <RequestError
        error={storedAdjustment.error || error}
        onRetry={
          storedAdjustment.error
            ? () => setStoredAdjustment(getStoredAdjustment(operatorId, user.id))
            : undefined
        }
      />
      {pendingAdjustment ? (
        <Alert
          type="info"
          content="本次调整尚待确认，内容已锁定。可重试确认；关闭或刷新后重新打开会继续本次调整。"
          className={styles.error}
        />
      ) : null}
      <Form
        form={form}
        key={storedAdjustment.error ? 'storage-error' : 'ready'}
        id={formId}
        layout="vertical"
        initialValues={
          pendingAdjustment?.payload || { direction: 'increase', amount: '', reason: '' }
        }
        onSubmit={adjustBalance}
        disabled={isSubmitting || Boolean(pendingAdjustment) || Boolean(storedAdjustment.error)}
      >
        <Form.Item
          label="调整方向"
          field="direction"
          rules={createFieldRules(balanceChangeSchema.shape.direction)}
        >
          <Select
            options={[
              { label: '增加', value: 'increase' },
              { label: '扣减', value: 'decrease' },
            ]}
          />
        </Form.Item>
        <Form.Item
          label="金额"
          field="amount"
          extra="输入大于 0 的金额，最多支持四位小数。"
          rules={createFieldRules(balanceChangeSchema.shape.amount)}
        >
          <Input inputMode="decimal" placeholder="例如：10.0000" autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="原因"
          field="reason"
          rules={createFieldRules(balanceChangeSchema.shape.reason)}
        >
          <Input.TextArea
            placeholder="说明本次余额调整的原因"
            maxLength={500}
            showWordLimit
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>
      </Form>
      <div className={styles.formActions}>
        <Space>
          <Button onClick={onCancel} disabled={isSubmitting}>
            取消
          </Button>
          {pendingAdjustment ? (
            <Button
              type="primary"
              loading={isSubmitting}
              onClick={() => adjustBalance(pendingAdjustment.payload)}
            >
              重试本次调整
            </Button>
          ) : (
            <Button
              type="primary"
              htmlType="submit"
              form={formId}
              loading={isSubmitting}
              disabled={Boolean(storedAdjustment.error)}
            >
              确认调整
            </Button>
          )}
        </Space>
      </div>
    </Modal>
  );
}
