import React, {type PropsWithChildren} from "react";

const Component: React.FC<PropsWithChildren<{
  title?: string;
}>> = (props) => {
  return (
    <div className="h-screen bg-blue-200 md:bg-blue-200">
      <div className="block md:hidden h-48">
        <div className="pt-20 pl-8 select-none">
          <div className="text-3xl font-semibold pb-3">{props.title}</div>
          <div className="text-xl">交通运输企业安全生产管理系统</div>
        </div>
      </div>
      <div className="h-[calc(100vh-12rem)] md:h-screen md:flex justify-center items-center">
        <div className="bg-white md:pb-4 pt-6 h-full md:h-auto md:mb-48 rounded-t-2xl md:rounded-2xl overflow-hidden shadow-lg">
          <div className="hidden md:block px-6 pb-6 text-center select-none">
            <div className="text-3xl font-semibold pb-3">{props.title}</div>
            <div className="text-lg">交通运输企业安全生产管理系统</div>
          </div>
          <div className="px-6">
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Component;
