import React, {type PropsWithChildren} from "react";

const Component: React.FC<PropsWithChildren<{
  title?: string;
}>> = (props) => {
  return (
    <div className="h-screen bg-blue-800 md:bg-blue-200">
      <div className="block md:hidden h-48">
        <div className="text-white pt-20 pl-8">
          <div className="text-3xl font-semibold pb-3">{props.title}</div>
          <div className="text-xl">交通运输企业安全生产管理系统</div>
        </div>
      </div>
      <div className="h-[calc(100vh-12rem)] md:h-screen md:flex justify-center items-center">
        <div className="bg-white md:pb-4 pt-6 h-full md:h-auto md:mb-72 rounded-t-lg md:rounded-lg overflow-hidden shadow-lg">
          <div className="hidden md:block pb-6 text-center">
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
