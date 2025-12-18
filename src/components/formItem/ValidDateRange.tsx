import { DatePicker, Switch } from 'antd';
import { useMemo } from 'react';
import { day } from '@/lib/utils.ts';

const Component: React.FC<{
  value?: (string | undefined | null)[];
  onChange?: (value: (string | undefined | null)[]) => void;
}> = (props) => {
  const isLong = useMemo(() => props.value?.[1] === '#LONG', [props.value]);

  return (
    <div className="flex gap-x-3 items-center">
      <div>
        <DatePicker.RangePicker
          value={[
            props.value?.[0] ? day(props.value?.[0]) : null,
            props.value?.[1]
              ? props.value?.[1] === '#LONG'
                ? day('2099-01-01')
                : day(props.value?.[1])
              : null,
          ]}
          onChange={(value) => {
            props.onChange?.([
              value?.[0]?.format('YYYY-MM-DD'),
              props.value?.[1] === '#LONG'
                ? '#LONG'
                : value?.[1]?.format('YYYY-MM-DD'),
            ]);
          }}
          disabled={[false, isLong]}
        />
      </div>
      <div className="flex gap-x-1 items-center select-none">
        <div>长期</div>
        <Switch
          value={isLong}
          onChange={() => {
            props.onChange?.([
              props?.value?.[0],
              props.value?.[1] === '#LONG' ? '2099-01-01' : '#LONG',
            ]);
          }}
        />
      </div>
    </div>
  );
};

export const ValidDateRangeView: React.FC<{
  value?: string[];
}> = (props) => {
  return (
    <div className="flex items-center gap-x-2">
      <div>
        {props.value?.[0] ? day(props.value?.[0]).format('YYYY-MM-DD') : '未知'}
      </div>
      <div>~</div>
      <div>
        {props.value?.[1]
          ? props.value?.[1] === '#LONG'
            ? '长期'
            : day(props.value?.[1]).format('YYYY-MM-DD')
          : '未知'}
      </div>
    </div>
  );
};

export default Component;
