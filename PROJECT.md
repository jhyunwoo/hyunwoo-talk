# Hyunwoo Talk Project

이 프로젝트는 터치짐 사이트(https://touchgym.co.kr) 사이트만 접속할 수 있는 사용자가 외부 대상과 메시지를 주고 받을 수 있는 서비스를 개발하는 프로젝트이다.

## 핵심 아이디어
터치짐 사이트(https://www.touchgym.co.kr/m/login.php?club_id=) 사이트에 접속 후 관리자 로그인을 하게 되면 https://w2.touchgym.co.kr/m/member/notice1.php 사이트로 리다이렉션 된다. 이후 터치짐 관리자 실행 버튼을 누르면 https://w2.touchgym.co.kr/m/member/ 사이트로 이동하게 되어 회원 관리를 할 수 있는 페이지가 나타난다. 여기에서 
```
fetch("https://w2.touchgym.co.kr/m/member/minfo.php?qa=1&seq=5966856", {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "sec-ch-ua": "\"Google Chrome\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "iframe",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
  },
  "referrer": "https://w2.touchgym.co.kr/m/member/",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include"
});
```
위 요청을 통해 사용자의 정보를 불러오는 것이 일차적 목표이다. 위 요청이 성공한 경우 아래와 같은 응답을 받게 된다.
```
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
	<title>터치짐</title>
	<script type="text/javascript" src="/lib/jquery/js/jquery-1.4.1.min.js"></script>
	<script type="text/javascript" src="/lib/jquery/js/jquery-ui-1.7.2.custom.min.js"></script>
	<link rel="stylesheet" href="/lib/jquery/css/ui-lightness/jquery-ui-1.7.2.custom.css" type="text/css" />
	<link rel="stylesheet" href="/m/include/style2_boldfix.css" type="text/css" />
	<script type="text/javascript" src="/lib/js/basic.js"></script>
	<script type="text/javascript" src="/lib/js/jquery.alphanum.js"></script>	
	<script type="text/javascript" src="/lib/swfobject/swfobject.js"></script>
	<script type="text/javascript" src="/lib/SmartEditor/js/HuskyEZCreator.js" charset="utf-8"></script>
	<script type="text/javascript" src="/lib/ajaxupload/ajaxupload.js"></script>
</head>
<body><div id="medit">
		<form name="form" method="post" action="?seq=5966856&q=w" onsubmit="return FormCheck(this)">
	<input type="hidden" name="seq2" value="5966856" id="image_code1" title="업로드에 필요한 이미지코드" />
	<input type="hidden" name="uploaded_photo" id="uploaded_photo" value="" title="업로드된 이미지"/>

	<div id="pictureArea">
		<div id="pic">
						<a href="picture.php?seq=5966856" onclick="parent.open_picture(this.href);event.returnValue = false;return false;"><img src="/m/images/noimage.jpg" id="photo" width="135"/></a>			<br/>
					</div>
				
		<a href="/m/member/capture.php?seq=5966856" onclick="camera1(this.href);event.returnValue = false;return false;"><img src="/m/images/btn_n_camera.gif" alt="사진촬영"/></a><img src="/m/images/btn_n_file.gif" alt="사진파일등록" id="btnUpload"/><p id="uploaded_name" style="display:none"></p><div style="width:157px;height:5px;"></div><div id="open_picture"><input type="checkbox" name="open_picture" value="Yes" checked="checked"/><span style="font-size:11px">터치출석에 사진노출</span></div>
		
		
	</div>
	<div id="minfo">	
		
		<div id="startdate"><input type="text" name="startdate" value="0000-00-00" size="10" maxlength="10" style="border:0px" readonly/></div>
		<div id="enddate"><input type="text" name="enddate" value="0000-00-00" size="10" maxlength="10" style="border:0px" readonly/></div>
		<div id="expire">기간종료 </div>

		&nbsp;&nbsp;											<a href="?seq=5966856&q=wd" onclick="return confirm('결제내역은 지워지지 않습니다.회원정보를 삭제하시겠습니까?')"><img src="/m/images/btn_del.gif" alt="삭제"/></a> 
						 
												

											</div>
	<div id="meditwrap">		
		
		<div id="mdetail">
			<div style="height:30px"></div>
			<table>
			<colgroup>
				<col width="70"/>
				<col />
				<col width="70"/>
				<col />
				<col width="70"/>
				<col />
			</colgroup>							
			<tbody>
			<tr>
				<th>회원번호</th>
				<td><input type="text" name="id" value="7890" id="memdata_id" size="6"/><span class="button"><a href="javascript:idcheck()"><img src="/m/images/box_mnew_check.gif" alt="중복검사"/></a></span></td>
				<th>회원그룹</th>
				<td>
					<select name="group_no" title="결제로도 구분가능하니 회원그룹을 사용안하셔도 됩니다">
					<option value="">지정안함</option>
										<option value="1041" >*</option>
										<option value="1292" >*</option>
										</select>
				</td>
				<th>입실통보</th>
				<td>
					<input type="text" name="phone2" value="" id="phone2" size="13" style="width:100px"/> <span style="font-size:11px;" id="phone2_tag">입실시 이번호로 문자통보(예:학부모)</span>
					<div style="display:none">
					<input type="checkbox" name="use_lesson_valid" value="Yes" /> 레슨전용회원(레슨기간으로 종료표시)
					</div>
				</td>
			</tr>
			<tr>
				<th>이름</th>
				<td><input type="text" name="name" value="김*준" id="memdata_name"/></td>
				<th>성별</th>
				<td>남 <input type="radio" name="sex" value="남" checked="checked"> 여 <input type="radio" name="sex" value="여" > 키<input type="text" name="tall" value="0" id="memdata_tall" size="3" maxlength="3" size="3" maxlength="3" style="width:20px"/></td>
								<th>연령대</th>
				<td>
					<select name="agetype">
					<option value="">미입력</option>
					<option value="1" >10대</option>
					<option value="2" >20대</option>
					<option value="3" >30대</option>
					<option value="4" >40대</option>
					<option value="5" >50대</option>
					<option value="6" >60대</option>
					<option value="7" >70대</option>
					<option value="8" >80대</option>
					<option value="9" >90대</option>
					</select> 일련번호 : <a href="../stats/?page=c3RhdHM0XzMucGhwP21lbWJlcl9zZXE9NTk2Njg1Ng==" onclick="parent.location.href=this.href">5966856</a>
				</td>
				
				
			</tr>
			<tr>
				<th>휴대전화</th>
				<td>
					<input type="text" name="phone" value="010-****-7890" id="phone"/></td>
				<th>생년월일</th>
				<td><input type="text" name="birthday1" value="0000" size="4" maxlength="4" style="width:40px"/>/<input type="text" name="birthday2" value="00" size="2" maxlength="2" style="width:20px"/>/<input type="text" name="birthday3" value="00" size="2" maxlength="2" style="width:20px"/></td>
				<th>
					담당					
				</th>
				<td>
					<select name="myteacher">
					<option value="">트레이너선택</option>
										<option value="6079" >관리자</option>
										</select>
					<select name="myfc">
					<option value="">직원/FC선택</option>
										<option value="6079" >관리자</option>
										</select>
					
					
				</td>
				
			</tr>
			<tr>
				<th>우편번호</th>
				<td><input type="text" name="zipcode1" value="" size="3" maxlength="3" style="width:30px"/>-<input type="text" name="zipcode2" value="" size="3" maxlength="3" style="width:30px"/> <a href="/visualpop/module/member/search_zipcode.php?zip1=zipcode1&zip2=zipcode2&addr=address1&addr2=address2" onclick="window.open(this.href,'searchaddress','width=400,height=300,scrollbars=yes');event.returnValue = false;return false;"><img src="/m/images/btn_zipcode.gif" alt="우편번호찾기"/></a></td>
				<th>클럽비번</th>
				<td><input type="password" name="password" size="8" title="클럽홈페이지의 마이페이지에서 회원들이 사용하는 비밀번호입니다.사용안하셔도 됩니다" style="width:40px"/> <span style="font-weight:normal">RF</span> <input type="text" name="rf_number" value="" title="커서이곳에 두시고 RF카드를 인식하세요"/></td>
				<td colspan="2" rowspan="3" style="text-align:center;border-bottom:0px"><textarea name="memo" style="color:#000;font-family:Apple SD Gothic Neo,arial,sans-serif,돋움,gulim;"></textarea></td>
			</tr>
			<tr>
				<th>주소</th>
				<td colspan="3"><input type="text" name="address1" value="" style="width:25%;"/> <input type="text" name="address2" value="" style="width:25%;"/> 아파트 <input type="text" name="addr_aptdong" value="" style="width:30px"/> 동 <input type="text" name="addr_aptho" value="" style="width:30px"/>호</td>
			</tr>
			<tr>
				<td colspan="4" style="border-bottom:0px">
					<div id="okbutton">
					<input type="image" src="/m/images/medit_button_ok.gif" alt="회원정보변경완료" style="z-index:100"/> 
										<a href="../stats/?page=c3RhdHM1XzIucGhwP21lbWJlcl9ubz01OTY2ODU2" onclick="parent.location.href=this.href"><img src="/m/images/btn_log.gif" alt="전체방문내역"/></a>
										<a href="?seq=5966856&q=inout" ><img src="/m/images/btn_in.gif" alt="입실" id="inout_icon"/></a>										<span id="inout_wait" style="display:none">입실처리중...</span>
					<a href="/m/sms/index.php?xpage=sms.php%3Fsend_phone%3D010%2A%2A%2A%2A7890%7C5966856%7C%EA%B9%80%2A%EC%A4%80" target="_parent"><img src="/m/images/btn_sms1.gif" alt="문자발송"/></a>					<a href="lockerlog.php?seq=5966856" onclick="parent.open_lockerlog(this.href);event.returnValue = false;return false;"><img src="/m/images/btn_lockerlog.gif" alt="락커기록"/></a> 
										&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
					<iframe src="about:blank" id="inout_iframe" width="1" height="1" style="display:none"></iframe>		
					
					

				</td>
			</tr>
			</table>
			
		</div>	
		</div>		
	</div>
	</form>	
	<div id="meditbottom"></div>
</div>
<!--
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">얼굴인식 출석 베타 출시 !!! 추가 프로그램사용료 없이 소프트웨어만 설치하세요</span> <a href="event1.php" onclick="window.open(this.href,'event1','width=900,height=800,scrollbars=yes');return false">자세히보기</a></div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">얼굴인식 이젠 태블릿으로도 가능합니다. 안드로이드 태블릿 지원 , 회원번호전용으로 사용가능</span> <a href="event1.php" onclick="window.open(this.href,'event1','width=900,height=800,scrollbars=yes');return false">자세히보기</a></div>
-->
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">문자요금 가격인하!!!</span> 부가세별도 약13.5원(부가세포함15원) 으로 가격을 확 낮췄습니다. 55,000원 3,667건 / 110,000원 7,334건 / 220,000원 14,667건</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">크롬등 브라우저의 강력한 정책으로 인해 터치짐 화면이 아닌 다른탭을보거나 브라우저를내리면(최소화) 실시간방문현황 자동확인을 멈춥니다.</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">다시 터치짐을 보게되면 자동확인을 합니다. 소리재생도 자동재생(클릭없는재생)이라 소리알림이 막힐수 있습니다.양해 부탁드립니다</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">입실문자통보에 1일 입실한번,퇴실한번 제한 기능추가 [SMS-입실문자통보]</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">회원목록 정렬에 이름순이 추가되었습니다</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">클럽홈페이지 이용저조와 보안상에 관계로 폐쇄합니다.양해부탁드립니다</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">예약시 차감이 되는 예약차감권기능이 추가되었습니다. 사용하실업체는 터치짐으로 문의주세요  <a href="https://blog.naver.com/gonasky/223147251016" target="_blank">[사용법안내]</a></div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">설정 - 수강료금액설정 안에 노출순서를 정할수 있는 [노출순서정하기] 기능이 추가되었습니다</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">[공정서비스 권리안내] 무례한 고객(업체)은 거부하겠습니다.</span> <a href="https://blog.naver.com/gonasky/221606470085" target="_blank">[자세히보기]</a></div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">터치짐은 약정없고 사용료를 먼저 내고 쓰는 선납프로그램입니다.공지를 직접확인해주시고 미납시 문자나 전화통보를 따로 하지 않습니다</span> <a href="https://blog.naver.com/gonasky/221606470085" target="_blank">[자세히보기]</a></div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">문자발송완료라도 각각 통신사에서 스팸처리 인해 문자를 못읽을수 있으며 각각 통신사에서 과금하므로 터치짐도 무조건과금합니다</span> <a href="https://blog.naver.com/gonasky/221606470085" target="_blank">[자세히보기]</a></div>

<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">안드로이드 셋탑(모델명 A95X) 악성코드 걸릴수도 있습니다. 초기화해서 사용가능합니다</span> <a href="https://blog.naver.com/gonasky/221698430484" target="_blank">[초기화방법]</a></div>

<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">[A/S안내] 모니터,셋탑은 렌탈이 아닌구매입니다. 무상수리기간은 구매일로부터 1년입니다</span> <a href="https://blog.naver.com/gonasky/221607210524" target="_blank">[자세히보기]</a></div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;"><span style="color:#f00;font-weight:normal;">터치출석제품고장시 전화상으로 고장유무판단이 어렵습니다.고장일경우 터치짐으로 보내주세요.무상수리는 구매후 1년까지입니다</span> <a href="https://blog.naver.com/gonasky/221607210524" target="_blank">[자세히보기]</a></div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">업무시간은 평일 오전9시~오후6시.업무시간종료후엔 전화를 받지 않습니다.택배는 오후4시종료, 문자충전과 급한내용은 문자로 주세요.</div>
<div class="notice_m" style="display:none;height:30px;clear:both;text-align:center;">(주)터치짐 계좌번호 : <span style="color:#f00">기업 418-071007-01-011</span> 월사용료는 33,000원(부가세포함)입니다. <a href="https://blog.naver.com/gonasky/221383826493" target="_blank">[자세히보기]</a></div>
<div id="mpaywrap">
<div id="mpay">
	<!--1.0start-->
	<form method="post" action="?seq=5966856&q=classnum_edit">
	<h2 style="font-size:12px;color:#333;"><input type="submit" value="전체회차수정"/> 결제 내역 <!--( 회차는 수강비만 해당되며 회차는 본인판단입니다,회차 입력하시고 회차전체수정버튼을 클릭하세요)--> 
	<span id="guidebook" style="text-align:center;color:#ff8400;font-weight:normal;display:none"></span>
	</h2>
		<p class="new"> 		
		<a href="pay.php?seq=5966856" onclick="parent.open_pay(this.href);event.returnValue = false;return false;"><img src="/m/images/mpay_button_new.gif" alt="결제등록"/></a>  <a href="rental.php?seq=5966856" onclick="parent.open_rental(this.href);event.returnValue = false;return false;"><img src="/m/images/mpay_button_rental.gif" alt="대여등록"/></a>
		
		
	<a href="paylog.php?seq=5966856" onclick="parent.open_paylog(this.href);event.returnValue = false;return false;"><img src="/m/images/mpay_button_log.gif" alt="결제기록"/></a> <a href="paytransfer.php?seq=5966856" onclick="parent.open_payedit1(this.href);event.returnValue = false;return false;"><img src="/m/images/btn_transfer.gif" alt="양도"/></a> <a href="transfer_log.php?seq=5966856" onclick="parent.open_paylog(this.href);event.returnValue = false;return false;"><img src="/m/images/btn_transfer2.gif" alt="양도로그"/></a></p>
		<div id="mpaydata">
		
		<table>
		<colgroup>
			<col width="30"/>
			<col width="50"/>
			<col width="80"/>
			<col width="75"/>
			<col/>
			<col width="100"/>
			<col width="150"/>
			<col width="200"/>
		</colgroup>
		<thead>
		<tr>
			<th>No</th>
			<th>종류</th>
			<th>결제일/영수증</th>
			<th>회차</th>
			<th>수강종목</th>
			<th>결제금액</th>
			<th>사용기간</th>
			<th>설정</th>
		</tr>
		</thead>
		<tbody>
				</tbody>
		</table>
	</div>
	</form>
	<!--1.0end-->
	
		
	
	<div style="clear:both;"></div>

</div>

<div id="mbottom">
	<div id="mlog">
		<div id="mlogwrap">
		<h2 style="font-size:12px;color:#333;">방문내역</h2>
		<p class="detail"><a href="calendar.php?seq=5966856" onclick="parent.open_calendar(this.href);event.returnValue = false;return false;"><img src="/m/images/mlog_button_detail.gif" alt="상세보기"/></a></p>
		<!--금일 부하예방을 위해 방문내역은 안됩니다.<br/>상세보기를 이용바랍니다-->
		<iframe src="mini_calendar.php?seq=5966856" width="200" height="200" frameborder="0" id="mini_calendar" scrolling="no"></iframe>
		</div>
	</div>
	<div id="mbody">
		<div style="postion:relative;width:100%;min-height:100px;">
		<h2 style="font-size:12px;color:#333;margin-bottom:5px;">락커사용현황</h2>
				<div id="mbodywrap">
			<table>
			<colgroup>			
			<col width="50%"></col>
			
			<col width="50%"></col>
			</colgroup>
			<tbody>
			<tr>
				
				<td style="text-align:left;color:#6a75ff;font-weight:normal;font-size:11px;">
				[#1] 
																</td>
				
				<td style="text-align:left;color:#6a75ff;font-weight:normal;font-size:11px;">
				[#1추가]
																</td>
			</tr>
			<tr>
			<tr>
				
				<td style="text-align:left;color:#6a75ff;font-weight:normal;font-size:11px;">
				[#2] 
																				</td>
				<td style="text-align:left;color:#6a75ff;font-weight:normal;font-size:11px;">
				[#2추가]
																</td>
			</tr>

			<tr>
				<td style="text-align:left;color:#6a75ff;font-weight:normal;font-size:11px;">
				[#3]
																</td>
				<td style="text-align:left;color:#6a75ff;font-weight:normal;font-size:11px;">
				[#3추가]
																</td>
			<tr>
			

			</tbody>
			</table>
		</div>
		</div>
		<div style="postion:relative;width:100%;min-height:100px;">
		<h2 style="font-size:12px;color:#333;margin-bottom:5px;">상담내역 <span style="position:relative;right:0;top:0;"><a href="counsel.php?seq=5966856" onclick="parent.open_counsel(this.href);event.returnValue = false;return false;">[상담등록]</a></span></h2>
		
		<div id="mbodywrap">
			<table>
			<colgroup>
			<col width="80"/>
			<col width="80"/>
			<col />
			<col width="80"/>

			</colgroup>
			<thead>
			<tr>
				<th>상담일</th>
				<th>상담직원</th>
				<th>상담내용</th>
				<th>등록일</th>
			</tr>
			</thead>
			<tbody>
						</tbody>
			</table>
		</div>
		</div>
		
		<div style="postion:relative;width:100%;min-height:100px;">
		<h2 style="font-size:12px;color:#333;margin-bottom:5px;">체지방내역 <span style="position:relative;right:0;top:0;"><a href="bodycheck.php?seq=5966856" onclick="parent.open_bodycheck(this.href);event.returnValue = false;return false;">[체지방등록]</a></span></h2>
		*체지방등록에 예약일만 입력해두시면 예약일에 회원에게 자동문자발송됩니다.(자동문자설정은 SMS->체지방검사예약문자설정에 설정후 이용가능)
		<div id="mbodywrap">
			<table>
			<thead>
			<tr>
				<th>예약일</th>
				<th>검사일</th>
				<th>체중</th>
				<th>BMI</th>
				<th>근육량</th>
				<th>체지방량</th>
				<th>체지방률</th>
				<th>기초대사량</th>
				<th>종합점수</th>
			</tr>
			</thead>
			<tbody>
						</tbody>
			</table>
	</div>
	</div>
</div>


</div>

<form name="popForm" method="post" action="/camera.save2.ssl.php" id="formx1" target="iframex1">
    <input type="hidden" name="member_no" autocomplete="off"/>
	<input type="hidden" name="mempic" autocomplete="off" />
	<input type="hidden" name="nexts" autocomplete="off"/>
</form>
<iframe src="about:blank" width="1" height="1" name="iframex1" id="iframex1" style="display:none"></iframe>

<script type="text/javascript">
var check = 0;
var m_id = '7890';
function idcheck(){		
		id = document.forms.form.id.value;
		if(id == "") {
			alert("아이디를 입력하세요");
			document.forms.form.id.focus();
			return;
		}
		var valid = "0123456789"; 
		
		var temp; 
		document.forms.form.id.value = document.forms.form.id.value.toLowerCase(); 
		temp = document.forms.form.id.value.substring(0,1); 
		
		for (var i=0; i<document.forms.form.id.value.length; i++) { 
			temp = "" + document.forms.form.id.value.substring(i, i+1); 
			if (valid.indexOf(temp) == "-1") { 
			alert("숫자로만 이루어질수 있습니다.");
			document.forms.form.id.value = ""; 
			document.forms.form.id.focus(); 
			return;
			}
		}
		
		$.get("idcheck.php?seq=5966856&id="+id,function(data){
			check = 0;

			if(data == "") alert("Error");
			else if(data == "Yes") {
				check = 1;
				alert("등록가능한 아이디입니다");
				document.forms.form.name.focus(); 
			}
			else if(data == "No") {
				alert("등록 불가능한 아이디입니다");
				document.forms.form.id.value = "";
			}

			document.forms.form.id.focus();
		});	
}
function f_v2go(f){
	if(f.v2_go.value == 1) url = 'v2_pay_multiple.php';
	else if (f.v2_go.value == 2) url = 'v2_pay_view.php';
	url = url + '?seq=5966856';
	window.open(url,'v2','width=1000,height=700,scrollbars=yes');
	return false;
}
function FormCheck(f){
	var auth_memedit = "Yes";
	if(auth_memedit == "No") {
		alert("수정권한이 없습니다");
		return false;
	}
	if(f.id.value){
		if(m_id != f.id.value && check == 0) {
			alert("아이디 중복검사를 하세요");
			f.id.focus();
			return false;
		}
	}

	if(f.name.value == ""){
		alert("이름을 입력하세요");
		f.name.focus();
		return false;
	}

	var init_name = "김*준";
	if(f.name.value != init_name){
		if(confirm('이름이 변경되었습니다.변경하시겠습니까?')){
			 return true;
		} else {
			f.name.value = init_name;
			return false;
		}
	} else {
		return true;
	}
}
function go3(){
	document.location.reload();
}
function imageUploadX(seq,code_obj,obj,filename_obj,fileurl_obj,filename,size,resize_w,resize_h,loadfunc){
	
	var url = '/m/member/upload.php?seq='+seq+'&size='+size+'&resize_w='+resize_w+'&resize_h='+resize_h;
	jQuery(function(){
		new AjaxUpload(obj, {
			action: url,
			name: 'upfiles',
			responseType: 'json',
			onComplete: function(file, response){
				if(response.code == 0) alert("업로드에러"+response.errorcode);
				else if(response.code == 1) alert('용량을 초과하였습니다');
				else {					
					//$("#photo").attr('src',response.file2);
					nexts = response.resultnexts;
					new_status = (new_status + 1) % 255;
					setTimeout('photo_refresh()',3000);
				}
			},
			onSubmit: function(file, ext){
				if (ext && /^(jpg|png|jpeg|gif|bmp)$/i.test(ext)) {   
					$("#photo").attr('src','/m/images/uploading.gif');
					//setTimeout('go3()',3000);
					this.setData({
						
					});
				} else {
					alert('이미지만 업로드 하실수 있습니다');
					return false;
				}                            
			}
		});
	});
}


	
function guide_open(){
	var guide = '계룡대 무궁화  대표님 010-5075-3919 가 다를경우 반드시 터치짐에 문자로 남겨주세요';
	var company_code = '3088304413';
	if(!company_code) $("#guidebook").html('계룡대 무궁화 사업자등록증을 문자로 꼭~ 보내주시기 부탁드립니다');
	else $("#guidebook").html('안내 : ' + guide);
	
	$("#guidebook").fadeIn();
}

open_notice_m_i = 1;
function open_notice_m(){
	var sum_notice_m = $(".notice_m").length;
	if(open_notice_m_i > sum_notice_m) open_notice_m_i = 1;
	
	$(".notice_m").hide();
	$(".notice_m").eq(open_notice_m_i - 1).show();
	open_notice_m_i++;
	
	setTimeout('open_notice_m()',10000);
}
$(document).ready(function(){	
	//parent.$(".getMember_5966856").addClass("red");
	//parent.prev_no =  5966856;

	//parent.getCMember();

	/*
	$(".ndatalist").mouseover(function(){
		$(this).css('border','1px solid #f00');
	});
	$(".ndatalist").mouseout(function(){
		$(this).css('border','1px solid #ccc');
	});
	*/
	open_notice_m();



	

	

	


	$("#phone").focusout(function(){
		var strlen = $(this).get(0).value.length;
		var ch = '';

		if($(this).get(0).value.substr(3,1) != "-") {
			if(strlen == 10) {
				var ch = $(this).get(0).value.substr(0,3)  + '-' + $(this).get(0).value.substr(3,3) + '-' + $(this).get(0).value.substr(6,4);
				$(this).val(ch);
			} else if(strlen == 11) {
				var ch = $(this).get(0).value.substr(0,3)  + '-' + $(this).get(0).value.substr(3,4) + '-' + $(this).get(0).value.substr(7,4);
				$(this).val(ch);
			}
		}
	});

	$("#phone2").focusout(function(){
		var strlen = $(this).get(0).value.length;
		var ch = '';

		if($(this).get(0).value.substr(3,1) != "-") {
			if(strlen == 10) {
				var ch = $(this).get(0).value.substr(0,3)  + '-' + $(this).get(0).value.substr(3,3) + '-' + $(this).get(0).value.substr(6,4);
				$(this).val(ch);
			} else if(strlen == 11) {
				var ch = $(this).get(0).value.substr(0,3)  + '-' + $(this).get(0).value.substr(3,4) + '-' + $(this).get(0).value.substr(7,4);
				$(this).val(ch);
			}
		}
	});

	$("#phone2").click(function(){
		$("#phone2_tag").html('처음사용시엔 SMS > 입실자동문자 설정');
	});

	

	
	
	var open_picture = "Yes";
	if(open_picture == "No") $("#open_picture").hide();
	
	imageUploadX('5966856','image_code1','btnUpload','uploaded_photo','photo','uploaded_name',50000*1024,'','','');
	

	
	
	
	var open_error = '';

	
	
		
	
	
	
	

	

	
	if(!open_error) setTimeout('guide_open()',1000);
	else {
		$("#guidebook").html(open_error);
		$("#guidebook").fadeIn();
	}



});
function insert_img(){
	
}
function camera1(url1){	
	
		url2 = 'capture2.ssl.php?seq=5966856';
		window.open(url2,'x1','width=850,height=500,scrollbars=no');
}

var photo_refresh1 = 0;

var nexts = 0;
var new_status = 0;
function photo_refresh(){
	
	if(nexts > 3) var url_photo = "https://db14.touchgym.co.kr/upload/face2/3378/5966856_"+nexts+".jpg?t="+new_status;
	else var url_photo = "https://db14.touchgym.co.kr/upload/face2/3378/5966856.jpg?t="+new_status;
	
	$("#photo").removeAttr('src').attr('src',url_photo); 
}

window.onmessage = function (e) {
		var ns2 = "https://w2.touchgym.co.kr";
		 if(e.origin === ns2){
		$("#photo").attr('src','/m/images/uploading.gif');
		
		var data1 = e.data;
		
		if(nexts == 0 || nexts == 3) nexts = 1000;
		if(nexts >= 9999) nexts = 1000;
		nexts++;

		new_status = (new_status + 1) % 255;

		
		
		
		document.forms.formx1.member_no.value = '5966856';
		document.forms.formx1.mempic.value = data1;
		document.forms.formx1.nexts.value = nexts;
		
		document.forms.formx1.submit();
		
		setTimeout('photo_refresh()',3000);
		setTimeout('photo_refresh()',6000);
	}
};
function get_address(post1,post2,sido,gugun,dong){
	address = sido + ' ' + gugun + ' ' + dong;
	document.forms.form.zipcode1.value = post1;
	document.forms.form.zipcode2.value = post2;
	document.forms.form.address1.value = address;
	document.forms.form.address2.focus();
}

$(function() {
		$(".numeric1").numeric();
		$(".numeric1").css("ime-mode","disabled");
		$(".datepicker").datepicker({
			dateFormat  : 'yy-mm-dd',
			changeMonth : true,
			changeYear  : true
		});
		jQuery(function($){
		 $.datepicker.regional['ko'] = {
		  closeText: '닫기',
		  prevText: '이전달',
		  nextText: '다음달',
		  currentText: '오늘',
		  monthNames: ['1월','2월','3월','4월','5월','6월',
		  '7월','8월','9월','10월','11월','12월'],
		  monthNamesShort: ['1월','2월','3월','4월','5월','6월',
		  '7월','8월','9월','10월','11월','12월'],
		  dayNames: ['일','월','화','수','목','금','토'],
		  dayNamesShort: ['일','월','화','수','목','금','토'],
		  dayNamesMin: ['일','월','화','수','목','금','토'],
		  weekHeader: 'Wk',
		  dateFormat: 'yy-mm-dd',
		  firstDay: 0,
		  isRTL: false,
		  duration:200,
		  showAnim:'show',
		  showMonthAfterYear: false,
		  yearSuffix: '년'};
		 $.datepicker.setDefaults($.datepicker.regional['ko']);
		});
});

function manual_inout(id,url){
	if(id == ""){
		alert("수동입실을 하려면 회원의 회원번호가 존재해야합니다");
	} else {
		//alert(url);
		$("#inout_iframe").attr('src',url);
		$("#inout_icon").hide();
		$("#inout_wait").show();
		setTimeout('document.location.reload()',5000);

	}
}

function isA(a){
	if(!a) return 0;
	else return parseInt(a);
}
function _sprintf(t){
	if(t < 10) return "0"+t;
	else return t;
}
function getPlusDay(d,p){
	var _day = d.split("-");
	var theDay = new Date(_day[0],isA(_day[1])-1,isA(_day[2])+isA(p),-1);
	return theDay.getFullYear() + '-' + _sprintf(theDay.getMonth()+1) + '-' + _sprintf(theDay.getDate());
}	
function getPlusMonth(d,p){
	var _day = d.split("-");
	var _m = isA(_day[1]) - 1 + isA(p);
	//var theDay = new Date(_day[0],_m,isA(_day[2]),-1);
	var theDay = new Date(_day[0],_m,isA(_day[2]),0);
	
	return theDay.getFullYear() + '-' + _sprintf(theDay.getMonth()+1) + '-' + _sprintf(theDay.getDate());
}

</script>
</body>
</html>

```
위 응답에서 ``<textarea name="memo" style="color:#000;font-family:Apple SD Gothic Neo,arial,sans-serif,돋움,gulim;"></textarea>`` 컴포넌트 안에 들어있는 값을 활용할 것이다. 

우선 이 기능 구현을 위해서 로그인 요청 시 받는 PHPSESSID를 추출하여 사용자 정보 요청 requeset시에 포함하여 보내 사용자 정보 접근이 가능하게 해야한다. 이후 사용자 정보 업데이트 요청을 하여 textarea 안에 있는 값을 업데이트 하며 채팅 내용을 상대방에게 전달할 수 있도록 할 것 이다. 

따라서 우선 touchgym에서 사용자가 로그인 하는 방식에 대해 분석한 뒤 제공된 클럽아이디, 아이디, 비밀번호를 사용하여 로그인을 진행할 것이다. 이후 PHPSESSI를 받아내면 사용자 정보 요청과 사용자 정보 수정 요청을 통해 사용자가 전송한 메시지를 textarea 안에 작성하여 메시지 기능을 구현한다. 

## 사용자 구분
1. 웹사이트 사용자
웹사이트 사용자는 모든 인터넷에 대한 접근이 가능한 사용자이다. 웹사이트 사용자는 웹사이트를 통해 상대방에게 메시지를 주고 받는다. Web Push 기능을 구현하여 상대방에게 메시지가 왔을 경우 알림을 받을 수 있도록 한다.

2. Touchgym 웹사이트 콘솔 사용자 (이하 콘솔 사용자)
콘솔 사용자는 touchgym 사이트 제외 모든 사이트 접근이 불가하다. 따라서 touchgym 사이트에서 관리자 패널 콘솔을 열어 기본 세팅 함수를 입력한 뒤 함수 입력을 통해 상대방에게 메시지를 전송하고, 10초에 한 번 touchgym 사용자 데이터 요청을 통해 새로 수신한 메시지가 없는지 확인한다. 

## 서비스 구성
### 백엔드
#### 기능
- 10초에 한 번 사용자 정보 요청 request를 보내 새로 추가된 메시지가 있는지 확인한다.
- 만약 추가된 내용이 있을 경우 데이터베이스에 기록 후 웹사이트 사용자에게 알림을 보낸다.
- 웹사이트 사용자가 메시지를 보낼 경우 데이터베이스에 내용 기록 후 touchgym 사이트 사용자 정보 안 textarea 안에 내용을 추가하여 콘솔 사용자가 메시지를 받을 수 있게 한다.
- 어제와 오늘 채팅 기록만 touchgym 사이트에 보관하고 이전 채팅 기록은 touchgym에서 삭제한다. 모든 채팅 기록은 데이터베이스에 영구적으로 저장해둔다.
#### 구성
- Hono.js
- Cloudflare Workers에 배포
- Cloudflare D1 데이터베이스 사용
- Drizzle ORM 사용
- Hono Stacks를 사용하여 문서화가 용이하게 한다

### 웹사이트
- Next.js로 구성
- WebApp을 적용하여 Web Push Notification을 구현
- 모던한 UI를 적용
- 웹에서 상대방에게 메시지를 보낼 수 있으며 메시지는 텍스트 및 이모지로만 제한
- 무한 스크롤 기능을 제공하여 과거 기럭을 볼 수 있게 함
- 사용자 첫 로그인시 사용자 id와 암호화 및 복호화에 사용하는 비밀번호를 입력 받음

### 콘솔 스크립트
- https://w2.touchgym.co.kr/m/member/ 사이트에서 콘솔을 열어 모든 콘솔 스크립트를 붙여 넣어 기본 세팅을 한다.
- login(id, password) 함수를 사용하여 사용자 id와 메시지 복호화를 위한 암호를 세팅한다.
- 첫 세팅시 기존 대화 내역 중에서 사용자 id로 보낸 메시지만 암호를 사용하여 복호화 한 뒤 모든 채팅 기록을 콘솔에 출력한다.
- 10초에 한 번 사용자 정보를 요청하여 새로 추가된 메시지가 없는지 확인한다. 
- sendTo(userId) 함수를 사용해 메시지 전송 대상을 설정해둔다.
- send(message) 함수를 사용하여 메시지를 전송한다.
- resetTarget() 함수를 사용하여 메시지 전송 대상 id를 초기화한다.

## 서비스 구조
1. 1 대 1 채팅 서비스를 구현
2. 수신자와 송신자는 모두 같은 비밀번호를 사용하여 암호화 및 복호화가 가능하게 함
예시)
user1Id: seoyeon
password: babo1015!

user2Id: hyunwoo
password: babo1015!

seoyeon --> hyunwoo (babo1015! 암호를 사용하여 암호화)
hyunwoo 수신 후 babo1015! 암호를 사용하여 복호화

따라서 채팅 이전에 미리 암호를 맞추지 않으면 채팅이 불가능 하도록 설정
