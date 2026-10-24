import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { Table } from '@arco-design/web-react';
import useMediaQuery from './useMediaQuery';
import styles from './AdaptiveTable.module.css';

const TableHeader = forwardRef(function TableHeader(props, ref) {
  return <div {...props} ref={ref} data-table-header />;
});

const TableBody = forwardRef(function TableBody({ style, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      data-table-body
      tabIndex={0}
      role="region"
      aria-label="表格内容"
      style={{ ...style, height: style?.maxHeight, overscrollBehavior: 'contain' }}
    />
  );
});

// Stable definitions keep Arco from remounting the scroll nodes during updates.
const tableComponents = {
  header: { wrapper: TableHeader },
  body: { wrapper: TableBody },
};

export default function AdaptiveTable({
  columns,
  data = [],
  scroll,
  pagination,
  onChange,
  minBodyHeight = 180,
  ...tableProps
}) {
  const frameRef = useRef(null);
  const [paginationElement, setPaginationElement] = useState(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const currentPage = pagination?.current;
  const pageSize = pagination?.pageSize;
  const [dimensions, setDimensions] = useState({
    body: minBodyHeight,
    chrome: 0,
    isCompact: false,
  });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const header = frame.querySelector('[data-table-header]');
    const footer = paginationElement;
    let animationFrame;

    function measureTable() {
      // Arco compensates for the header's native scrollbar with a negative margin.
      const headerMargin = header ? parseFloat(getComputedStyle(header).marginBottom) || 0 : 0;
      const chrome =
        (header?.getBoundingClientRect().height || 0) + headerMargin + (footer?.offsetHeight || 0);
      const body = Math.max(minBodyHeight, Math.floor(frame.clientHeight - chrome));
      const isCompact = frame.clientWidth < 480;
      setDimensions((previous) =>
        previous.body === body && previous.chrome === chrome && previous.isCompact === isCompact
          ? previous
          : { body, chrome, isCompact },
      );
    }

    function scheduleMeasure() {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measureTable);
    }

    const observer = new ResizeObserver(scheduleMeasure);
    [frame, header, footer].filter(Boolean).forEach((element) => observer.observe(element));
    measureTable();
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [minBodyHeight, paginationElement]);

  useLayoutEffect(() => {
    frameRef.current?.querySelector('[data-table-body]')?.scrollTo({ top: 0 });
  }, [currentPage, pageSize]);

  const paginationProps =
    pagination === false
      ? false
      : {
          ...pagination,
          ...(dimensions.isCompact ? { simple: true, showTotal: false } : {}),
          style: { ...pagination?.style, flexWrap: 'wrap', rowGap: 8 },
        };

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      data-adaptive-table
      style={{ minHeight: minBodyHeight + dimensions.chrome }}
    >
      <Table
        {...tableProps}
        className={[styles.table, tableProps.className].filter(Boolean).join(' ')}
        columns={isMobile ? columns.map((column) => ({ ...column, fixed: undefined })) : columns}
        data={data}
        scroll={{ ...scroll, y: dimensions.body }}
        pagination={paginationProps}
        components={tableComponents}
        renderPagination={(node) => (
          <div ref={setPaginationElement} className={styles.pagination}>
            {node}
          </div>
        )}
        onChange={(...args) => {
          frameRef.current?.querySelector('[data-table-body]')?.scrollTo({ top: 0 });
          onChange?.(...args);
        }}
      />
    </div>
  );
}
