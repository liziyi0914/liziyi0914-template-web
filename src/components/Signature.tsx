import { Button } from 'antd-mobile';
import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const Component: React.FC = () => {
  const divRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SignatureCanvas>(null);
  const [canvasSize, setCanvasSize] = useState<[number, number]>();

  useLayoutEffect(() => {
    if (divRef.current) {
      setCanvasSize([divRef.current.clientWidth, divRef.current.clientHeight]);
    }
  }, [divRef]);

  return (
    <div className="flex flex-col h-full touch-none">
      <div ref={divRef} className="bg-white grow relative">
        <div className="absolute top-0 left-0 right-0 bottom-0 flex justify-center items-center touch-none select-none pointer-events-none">
          <div className="rotate-90 text-nowrap">
            <div className="text-gray-300 text-5xl px-12">
              请翻转屏幕在此处签名
            </div>
            <div className="h-24 border-b-2 border-gray-300"></div>
          </div>
        </div>

        <div className="absolute top-0 left-0">
          <SignatureCanvas
            ref={canvasRef}
            canvasProps={{
              width: canvasSize?.[0],
              height: canvasSize?.[1],
            }}
          />
        </div>
      </div>
      <Button
        block
        size="large"
        onClick={() => {
          canvasRef.current?.clear();
        }}
      >
        重签
      </Button>
      <Button block color="primary" size="large">
        下一步
      </Button>
    </div>
  );
};

export default Component;
